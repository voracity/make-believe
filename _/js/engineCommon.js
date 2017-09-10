/// Add in topo order
function addNode(bn, id, parents, states, def, cpt, funcTable, funcDef) {
	var node = {id: id, seen: 0, counts: new Float32Array(new ArrayBuffer(states.length*4)), beliefs: new Float32Array(new ArrayBuffer(states.length*4)), states: [], parents: []};
	for (var i=0; i<parents.length; i++) {
		node.parents.push(bn.nodesById[parents[i]]);
	}
	for (var i=0; i<states.length; i++) {
		node.states.push({id: states[i]});
	}
	node.def = def ? Object.assign(Object.create(NodeDefinitions[def.type].prototype), def) : null;
	if (node.def)  node.def.compile({force:true});
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

	bn.nodesById[node.id] = node;
	bn._nodeOrdering.push(node);
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
			node.def);
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

function makeMultinomialBs(arr) {
	var arr = [...arr];
	for (var i=1; i<arr.length; i++)  arr[i] += arr[i-1];
	//onsole.log(arr);
	function make(arr, start, end) {
		if (end-start==0) {
			return `val = ${start};`;
		}
		var midpoint = Math.floor(((end+start)+1)/2);
		return `if (point <= ${arr[midpoint-1]}) {
			${ make(arr,start,midpoint-1) }
		}
		else {
			${ make(arr,midpoint,end) }
		}`;
	}
	funcBody = `var val = -1;
	${ make(arr, 0, arr.length-1) }
	return val;`;
	console.log(funcBody);
	return new Function('point', funcBody);
}

/// Assume arr is normalized
function sampleMultinomial(arr) {
	var point = Math.random();
	var sum = 0;
	for (var i=0; i<arr.length; i++) {
		sum += arr[i];
		if (point < sum) {
			return i;
		}
	}
	return -1;
}

function sampleMultinomialBs(func) {
	var point = Math.random();
	return func(point);
}

function count(arr) {
	var vals = {};
	for (var i=0; i<arr.length; i++) {
		if (!(arr[i] in vals)) {
			vals[arr[i]] = 0;
		}
		vals[arr[i]]++;
	}
	var sorted = {};
	for (var k of Object.keys(vals).sort((a,b)=>a-b)) {
		sorted[k] = vals[k];
	}
	return sorted;
}

/** I'm thinking these should be class methods on Node.
	Because they operate on inner properties of nodes.
	**/
function setupIndexes(nodes) {
	var indexes = new Array(nodes.length);
	for (var i=0; i<indexes.length; i++)  indexes[i] = 0;
	return indexes;
}

function nextCombination(nodes, indexes) {
	var hasMore = false;
	for (var i=indexes.length-1; i>=0; i--) {
		indexes[i]++;
		if (indexes[i] >= nodes[i].states.length) {
			indexes[i] = 0;
		}
		else {
			hasMore = true;
			break;
		}
	}
	return hasMore;
}

function prevCombination(nodes, indexes) {
	var hasMore = false;
	for (var i=indexes.length-1; i>=0; i--) {
		indexes[i]--;
		if (indexes[i] < 0) {
			indexes[i] = 0;
		}
		else {
			hasMore = true;
			break;
		}
	}
	return hasMore;
}

function testPerf() {
	var arr = [0.8,0.2];
	var func = makeMultinomialBs(arr);
	var t = performance.now();
	for (var i=0; i<10000000; i++) {
		sampleMultinomialBs(func);
	}
	console.log("Time:", performance.now() - t);
	t = performance.now();
	for (var i=0; i<10000000; i++) {
		sampleMultinomial(arr);
	}
	console.log("Time:", performance.now() - t);
}