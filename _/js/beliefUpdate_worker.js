bn = null;

if (typeof(importScripts)!="undefined") {
	importScripts('equationFunctions.js');
}

/// Add in topo order
function addNode(bn, id, parents, states, cpt, funcTable, funcDef) {
	var node = {id: id, seen: 0, counts: new Float32Array(new ArrayBuffer(states.length*4)), beliefs: new Float32Array(new ArrayBuffer(states.length*4)), states: [], parents: []};
	for (var i=0; i<parents.length; i++) {
		node.parents.push(bn.nodesById[parents[i]]);
	}
	for (var i=0; i<states.length; i++) {
		node.states.push({id: states[i]});
	}
	node.cpt = null;
	node.funcTable = null;
	node.func = null;
	node.funcDef = funcDef;
	node.samples = [];
	node.parentStates = new Float32Array(new ArrayBuffer(node.parents.length*4));
	node.removeStates = function() {
		/// XXX This will leave CPTs, etc. in an inconsistent state at this point
		this.states = [];
		this.statesById = {};
	};
	node.addStates = function(newStates) {
		for (var i=0; i<newStates.length; i++) {
			var stateName = newStates[i];
			this.states.push({id: stateName});
			this.statesById[stateName] = this.states.length-1;
		}
	};

	if (cpt) {
		node.cpt = new Float32Array(new ArrayBuffer(cpt.length*4));
		for (var i=0; i<node.cpt.length; i++)  node.cpt[i] = cpt[i];
	}
	if (funcTable) {
		node.funcTable = funcTable;
	}
	//onsole.log(node);
	//node.intId = bn.nodes.length;
	//bn.nodes.push(node);
	bn.nodesById[node.id] = node;
	bn._nodeOrdering.push(node);
	//onsole.log(bn._nodeOrdering.length, node.id);
}

function makeBnForUpdates(bn) {
	var newBn = {
		nodes: [],
		nodesById: {},
		_nodeOrdering: [],
	};

	for (var i=0; i<bn._nodeOrdering.length; i++) {
		var node = bn._nodeOrdering[i];
		addNode(newBn,
			node.id,
			node.parents.map(function(p){return p.id}),
			node.states.map(function(s){return s.id}),
			node.cpt,
			node.funcTable,
			node.funcDef);
	}
	/// Make sure main node list is in same order as bn that was passed in before
	for (var i=0; i<bn.nodes.length; i++) {
		var node = bn.nodes[i];
		var newNode = newBn.nodesById[node.id];
		//onsole.log('newNode', newNode, newBn.nodesById, node.id);
		newNode.intId = newBn.nodes.length;
		newBn.nodes.push(newNode);
	}
	//postMessage([1,newBn.nodes.map(n => n.id)]);

	return newBn;
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
		updateBeliefs_local(bn, evidenceArr, iterations);
		var allBeliefs = [];
		var allSamples = [];
		for (var i=0; i<bn.nodes.length; i++) {
			allBeliefs.push(bn.nodes[i].beliefs);
			allSamples.push(bn.nodes[i].samples);
		}
		postMessage([0,allBeliefs, allSamples]);
		//postMessage([0,[0,1]]);
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
		}
	}

	/// evidenceArr is already in the right format
	/*var evidenceArr = new Int32Array(new ArrayBuffer(bn.nodes.length*4));
	for (var i=0; i<evidenceArr.length; i++)  evidenceArr[i] = -1;
	for (var i in bn.evidence)  evidenceArr[bn.nodesById[i].intId] = Number(bn.evidence[i]);*/

	/// Generate cases
	for (var i=0; i<iterations; i++) {
		var weight = generateCase(bn, evidenceArr, cas);
		//onsole.log('generated:', cas);

		/// For each state of a non-E node, count occurrence given E
		//onsole.log(evidenceArr, Array.apply([], cas), weight);
		for (var intId=0; intId<cas.length; intId++) {
			var node = bn.nodes[intId];
			if (node.func) {
				node.samples[i] = cas[intId];
			}
			else {
				//node.counts[cas[v]] += 1;
				//node.seen += 1;
				// Do likelihood weighting instead
				node.counts[cas[intId]] += weight;
				node.seen += weight;
				//onsole.log(node.counts, node.seen, weight);
			}
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
}

function generateCase(bn, evidence, cas) {
	//ar cas = {};

	/// Get the root nodes, add to queue
	//var q = this._rootNodes.slice();

	var weight = 1;

	/// Dequeue nodes
	var numNodes = bn._nodeOrdering.length;
	var ni=0;
	for (;ni < numNodes; ni++) {
		var _node = bn._nodeOrdering[ni];
		cas[_node.intId] = 0;

		/** I believe inlining this is very slightly quicker **/
		//var rowI = this._getRowI(_node.parents, cas);
		var parents = _node.parents;
		var rowI = 0;
		var multiplier = 1;
		for (var pi=parents.length-1; pi>=0; pi--) {
			rowI += multiplier*cas[parents[pi].intId];
			multiplier *= parents[pi].states.length;
		}

		if (_node.func) {
			/// Evidence not supported yet!
			if (evidence[_node.intId] != -1) {

			}
			else {
				/// Generate value for node
				var parents = _node.parents;
				for (var pi=0; pi<parents.length; pi++) {
					_node.parentStates[pi] = cas[parents[pi].intId];
				}
				cas[_node.intId] = _node.func(_node.parentStates);
				//onsole.log(_node.parentStates, cas);
			}
		}
		else if (_node.cpt) {
			if (evidence[_node.intId] != -1) {
				/// Force evidence
				cas[_node.intId] = evidence[_node.intId];

				/// Calculate likelihood of evidence
				var likelihood = _node.cpt[rowI*_node.states.length + cas[_node.intId]];
				weight *= likelihood;
			}
			else {
				/// Generate state for node
				var stateProbs = _node.cpt;

				var parents = _node.parents;
				//onsole.debug("parents", parents);

				var currentSum = 0;
				var rowStart = rowI*_node.states.length;
				var rowEnd = (rowI+1)*_node.states.length-1;
				//onsole.debug("rowStart/End", parents, rowI, rowStart, rowEnd, Array.apply([], _node.cpt).slice(rowStart,rowEnd+1));
				var r = Math.random();
				for (var i=rowStart; i<=rowEnd; i++) {
					var stateProb = stateProbs[i];
					currentSum += stateProb;
					//onsole.debug(r, currentSum);
					if (r < currentSum) {
						cas[_node.intId] = (i-rowStart);
						break;
					}
				}
			}
		}
		else if (_node.funcTable) {
			if (evidence[_node.intId] != -1) {
				/// Force evidence
				cas[_node.intId] = evidence[_node.intId];

				/// Calculate likelihood of evidence (which is either 0 or 1)
				weight *= (_node.funcTable[rowI] == cas[_node.intId] ? 1 : 0);
			}
			else {
				/// Get the deterministic state
				cas[_node.intId] = _node.funcTable[rowI];
			}
		}

		/// Push node children onto stack
		//q = q.concat(_node.children);
	}

	return weight;
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