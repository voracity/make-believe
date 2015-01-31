bn = null;

onmessage = function(e) {
	if (e.data[0]==0) { // Worker has been sent the BN
		bn = e.data[1];
	}
	else if (e.data[0]==1) { //Worker has been sent the evidence (for belief update)
		var evidenceArr = e.data[1];
		updateBeliefs_local(bn, evidenceArr);
		var allBeliefs = [];
		for (var i=0; i<bn.nodes.length; i++) {
			allBeliefs.push(bn.nodes[i].beliefs);
		}
		postMessage([0,allBeliefs]);
	}
}

function renewArray(arr, initial) {
	var size = arr.length;

	for (var i=0; i<size; i++) {
		arr[i] = initial;
	}

	return arr;
}

function updateBeliefs_local(bn, evidenceArr) {
	var cas = new Int32Array(new ArrayBuffer(bn.nodes.length*4));

	for (var i=0; i<bn.nodes.length; i++) {
		var node = bn.nodes[i];
		renewArray(node.counts, 0);
		node.seen = 0;
	}

	/// evidenceArr is already in the right format
	/*var evidenceArr = new Int32Array(new ArrayBuffer(bn.nodes.length*4));
	for (var i=0; i<evidenceArr.length; i++)  evidenceArr[i] = -1;
	for (var i in bn.evidence)  evidenceArr[bn.nodesById[i].intId] = Number(bn.evidence[i]);*/

	/// Generate cases
	for (var i=0; i<bn.iterations; i++) {
		var weight = generateCase(bn, evidenceArr, cas);

		/// For each state of a non-E node, count occurrence given E
		//onsole.log(evidenceArr, Array.apply([], cas), weight);
		for (var intId=0; intId<cas.length; intId++) {
			var node = bn.nodes[intId];
			//node.counts[cas[v]] += 1;
			//node.seen += 1;
			// Do likelihood weighting instead
			node.counts[cas[intId]] += weight;
			node.seen += weight;
		}
	}

	for (var i in bn.nodes) {
		var node = bn.nodes[i];
		for (var j in node.beliefs) {
			if (node.seen>0)  node.beliefs[j] = node.counts[j]/node.seen;
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

		var rowI = _getRowI(_node.parents, cas);

		if (_node.cpt) {
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