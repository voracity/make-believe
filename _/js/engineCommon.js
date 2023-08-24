/// Add in topo order
function addNode(bn, id, parents, states, stateSpace, intervene, def, forClone = false) {
	var node = {id: id, seen: 0, counts: new Float32Array(new ArrayBuffer(states.length*4)), beliefs: new Float32Array(new ArrayBuffer(states.length*4)), states: [], statesById: {}, parents: []};
	for (var i=0; i<parents.length; i++) {
		node.parents.push(bn.nodesById[parents[i]]);
	}
	for (var i=0; i<states.length; i++) {
		//let state = {id: states[i], index: i};
		//let state = pick(states[i], ["id", /*"label",*/ "index", "value", "minimum", "maximum"]);
		node.states.push(states[i]);
		node.statesById[states[i].id] = states[i];
	}
	node.stateSpace = stateSpace;
	node.intervene = intervene;
	node.def = def ? Object.assign(Object.create(NodeDefinitions[def.type].prototype), def) : null;
	node.def.node = node;
	if (node.def)  node.def.compile({force:true});
	node.samples = [];
	node.sampleWeights = [];
	node.parentStates = new Float32Array(new ArrayBuffer(node.parents.length*4));
	if (forClone) {
		if (node.def.func)  node.def.func = null;
	}
	else {
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
		node.numParentCombinations = function() {
			var numParentStates = 1;
			for (var j=0; j<this.parents.length; j++) {
				numParentStates *= this.parents[j].states.length;
			}
			return numParentStates;
		},
		node.getDomain = function() {
			return [this.id, ...this.parents.map(p => p.id)];
		};
	}

	bn.nodesById[node.id] = node;
	bn._nodeOrdering.push(node);
}

function makeBnForUpdates(bn, forClone = false) {
	var newBn = {
		nodes: [],
		nodesById: {},
		_nodeOrdering: [],
	};
	
	console.assert(bn.nodes.length == Object.keys(bn.nodesById).length, "makeBnForUpdates: size of bn.nodes != bn.nodesById");
	console.assert(bn.nodes.length == bn._nodeOrdering.length, "makeBnForUpdates: size of bn.nodes != bn._nodeOrdering");
	
	for (var i=0; i<bn._nodeOrdering.length; i++) {
		var node = bn._nodeOrdering[i];
		addNode(newBn,
			node.id,
			node.parents.map(p => p.id),
			node.states.map(s => pick(s, "id", /*"label",*/ "index", "value", "minimum", "maximum")),
			node.stateSpace,
			node.intervene,
			node.def,
			forClone);
	}
	/// Make sure main node list is in same order as bn that was passed in before
	for (var i=0; i<bn.nodes.length; i++) {
		var node = bn.nodes[i];
		var newNode = newBn.nodesById[node.id];
		//onsole.log('newNode', newNode, bn.nodes, newBn.nodesById, node.id);
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

/// Count the number of state combinations across all nodes in |nodes|
function numNodeStateCombinations(nodes) {
	var numNodeStates = 1;
	for (var j=0; j<nodes.length; j++) {
		numNodeStates *= nodes[j].states.length;
	}
	return numNodeStates;
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
	var numStates = nodes;
	/// If |nodes| gives nodes, rather than array of number of states,
	/// convert
	if (nodes.length && nodes[0].states) {
		numStates = nodes.map(n => n.states.length);
	}
	var hasMore = false;
	for (var i=indexes.length-1; i>=0; i--) {
		indexes[i]++;
		if (indexes[i] >= numStates[i]) {
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
	var numStates = nodes;
	/// If |nodes| gives nodes, rather than array of number of states,
	/// convert
	if (nodes.length && nodes[0].states) {
		numStates = nodes.map(n => n.states.length);
	}
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

function nextCombinationWithSkips(nodes, indexes, skips) {
	var numStates = nodes;
	/// If |nodes| gives nodes, rather than array of number of states,
	/// convert
	if (nodes.length && nodes[0].states) {
		numStates = nodes.map(n => n.states.length);
	}
	var hasMore = false;
	for (var i=indexes.length-1; i>=0; i--) {
		if (skips[i]==1)  continue;
		indexes[i]++;
		if (indexes[i] >= numStates[i]) {
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

/** From utils.js **/
function pick(o, ...props) {
    return Object.assign({}, ...props.map(prop => typeof(o[prop])!=="undefined" ? {[prop]: o[prop]} : {}));
}

if (typeof(exports)!='undefined') {
	Object.assign(exports, {
		makeBnForUpdates,
	});
}