bn = null;
timeLimit = null;

if (typeof(exports)!='undefined') {
	importScripts = function(filename){
		var fs = require('fs');
		var vm = require('vm');
		var code = fs.readFileSync('./_/js/'+filename, 'utf-8');
		vm.runInThisContext(code, filename);
	}
}

if (typeof(importScripts)!="undefined") {
	importScripts('definitions.js');
	importScripts('equationFunctions.js');
	importScripts('engineCommon.js');
}

onmessage = function(e) {
	if (e.data[0]==0) { // Worker has been sent the BN
		//onsole.log("This is BN received", e.data[1]);
		bn = makeBnForUpdates(e.data[1]);
		//onsole.log("This is BN received 2", e.data[1]);
		//bn = e.data[1];
		//postMessage([1,bn]);
	}
	else if (e.data[0]==1) { //Worker has been sent the evidence (for belief update)
		var evidenceArr = e.data[1];
		var iterations = e.data[2];
		//postMessage([1,evidenceArr,iterations]);
		var iterationsRun = updateBeliefs_local(bn, evidenceArr, iterations);
		var nodeResults = [];
		//var allBeliefs = [];
		//var allSamples = [];
		for (var i=0; i<bn.nodes.length; i++) {
			//allBeliefs.push(bn.nodes[i].beliefs);
			//allSamples.push(bn.nodes[i].samples);
			nodeResults.push({
				beliefs: bn.nodes[i].beliefs,
				samples: bn.nodes[i].samples,
				sampleWeights: bn.nodes[i].sampleWeights,
			});
		}
		postMessage([0, nodeResults, iterationsRun]);
		//postMessage([0,[0,1]]);
	}
	// Set a time limit for updating beliefs
	else if (e.data[0]==2) {
		timeLimit = e.data[1];
		//onsole.log("timeLimit", timeLimit);
	}
}

function newArray(size, initial) {
	var arr = new Array(size);

	for (var i=0; i<size; i++) {
		arr[i] = initial;
	}

	return arr;
}

function renewArray(arr, initial) {
	var size = arr.length;

	for (var i=0; i<size; i++) {
		arr[i] = initial;
	}

	return arr;
}

function updateBeliefs_local(bn, evidenceArr, iterations) {
	var cas = new Int32Array(new ArrayBuffer(bn.nodes.length*4));
	var caseReal = new Float32Array(new ArrayBuffer(bn.nodes.length*4));
	var caseTypes = new Int32Array(new ArrayBuffer(bn.nodes.length*4)).fill(CASE_REAL_VALUE);

	for (var i=0; i<bn.nodes.length; i++) {
		var node = bn.nodes[i];
		renewArray(node.counts, 0);
		node.seen = 0;
		if (node.funcDef) {
			//onsole.log(node.funcDef);
			node.func = new Function(node.funcDef[0], node.funcDef[1]);
			/// XXX Just to test it out. This is way slower than an Int32Array (about 3 times slower)
			if (i==0)  cas = new Float32Array(new ArrayBuffer(bn.nodes.length*4));
			node.samples = new Float32Array(new ArrayBuffer(iterations*4));
			node.sampleWeights = new Float32Array(new ArrayBuffer(iterations*4));
		}
		else {
			if (['categorical','ordered'].includes(node.stateSpace.type)) {
				console.log('CASE TYPE: STATE');
				caseTypes[i] = CASE_STATE;
			}
			else if (['interval','continuous'].includes(node.stateSpace.type)) {
				console.log('CASE TYPE: INTERVAL');
				caseTypes[i] = CASE_INTERVAL;
			}
		}
	}

	/// evidenceArr is already in the right format
	/*var evidenceArr = new Int32Array(new ArrayBuffer(bn.nodes.length*4));
	for (var i=0; i<evidenceArr.length; i++)  evidenceArr[i] = -1;
	for (var i in bn.evidence)  evidenceArr[bn.nodesById[i].intId] = Number(bn.evidence[i]);*/

	/// In case we have a time limit, set  start time
	var startTime = Date.now();
	//onsole.log(iterations, timeLimit, startTime);
	
	var sampling = new Sampling({evidence: evidenceArr, case: cas, caseReal, caseTypes});
	
	/// Generate cases
	var iterI;
	var weight;
	for (iterI=0; iterI<iterations; iterI++) {
		sampling.weight = 1;
		generateCase(bn._nodeOrdering, sampling);
		weight = sampling.weight;
		//onsole.log('generated:', cas);

		/// For each state of a non-E node, count occurrence given E
		//onsole.log(evidenceArr, Array.apply([], cas), weight);
		for (var intId=0; intId<cas.length; intId++) {
			var node = bn.nodes[intId];
			if (node.def.type == 'Equation') {
				node.samples[iterI] = caseReal[intId];
				node.sampleWeights[iterI] = weight;
			}
			else {
				//node.counts[cas[v]] += 1;
				//node.seen += 1;
				// Do likelihood weighting instead
				node.counts[cas[intId]] += weight;
				node.seen += weight;
				//console.log(node.counts, node.seen, weight);
			}
		}
		//onsole.log(node.counts, node.seen);
		
		if (timeLimit && (Date.now() - startTime > timeLimit)) {
			break;
		}
	}

	for (var i=0; i<bn.nodes.length; i++) {
		var node = bn.nodes[i];
		if (node.func) {
			/// Need to handle discretization back in the main thread
		}
		else {
			for (var j=0; j<node.beliefs.length; j++) {
				if (node.seen>0)  node.beliefs[j] = node.counts[j]/node.seen;
			}
		}
	}
	
	return iterI;
}

function generateCase(_nodeOrdering, sampling) {
	var evidence = sampling.evidence;
	var cas = sampling.case;
	//ar cas = {};

	/// Get the root nodes, add to queue
	//var q = this._rootNodes.slice();

	/// Dequeue nodes
	var numNodes = _nodeOrdering.length;
	var ni=0;
	for (;ni < numNodes; ni++) {
		var _node = _nodeOrdering[ni];
		cas[_node.intId] = 0;
		
		_node.def.sample(sampling);
	}
}

function _getRowI(parents, cas) {
	var rowI = 0;
	var multiplier = 1;
	for (var pi=parents.length-1; pi>=0; pi--) {
		rowI += multiplier*cas[parents[pi].intId];
		multiplier *= parents[pi].states.length;
	}
	return rowI;
}

if (typeof(exports)!="undefined") {
	global.updateBeliefs_local = updateBeliefs_local;
}