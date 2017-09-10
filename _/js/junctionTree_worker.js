if (typeof(importScripts)!="undefined") {
	importScripts('equationFunctions.js');
	importScripts('engineCommon.js');
}

/// May have to copy these inline
var isLinked = function(n1,n2) { return Node.prototype.isParent.call(n1, n2) || Node.prototype.isParent.call(n2, n1); };
var checkCycle = function(from, to) { return Node.prototype.hasAncestor.call(from, to); };
function addArc(from, to) {
	to.parents.push(from);
	from.children.push(to);
}

var JunctionTree = {
	bn: null,

	updateBeliefs(evidenceArr) {
		
	},
	
	connectParents() {
		var toCheck = this.bn.nodes.slice();
		while (toCheck.length) {
			var node = toCheck.shift();
			for (var i=0; i<node.parents.length; i++) {
				for (var j=i+1; j<node.parents.length; j++) {
					/// parents not linked! fix it!
					if (!isLinked(node.parents[i], node.parents[j])) {
						/// beware of cycles
						var fromI, toI;
						if (checkCycle(node.parents[i], node.parents[j])) {
							fromI = j; toI = i;
						}
						else {
							fromI = i; toI = j;
						}
						addArc(node.parents[fromI], node.parents[toI]);
						/// 'to' now has a parent
						//oCheck.push(node.parents[toI]);
					}
				}
			}
		}
	},
	
	checkConnected(connected, isLinkedFunc = isLinked) {
		for (var i=0; i<connected.length; i++) {
			for (var j=i+1; j<connected.length; j++) {
				if (!isLinkedFunc(connected[i], connected[j])) {
					return false;
				}
			}
		}
		return true;
	},
	
	connectNodes(nodes) {
		for (var i=0; i<nodes.length; i++) {
			for (var j=i+1; j<nodes.length; j++) {
				if (!isLinked(nodes[i],nodes[j])) {
					/// Direction doesn't matter, as graph is undirected anyway
					addArc(nodes[i], nodes[j]);
				}
			}
		}
	},
	
	findSimplicialNodes(nodes) {
		var simplicialNodes = [];
		for (var node of nodes) {
			var connected = node.parents.concat(node.children);
			if (this.checkConnected(connected)) {
				simplicialNodes.push(node);
			}
		}
		return simplicialNodes;
	},
	
	triangulate() {
		var remainingNodes = this.bn.nodes.slice();
		var toEliminate = this.findSimplicialNodes(remainingNodes);
		while (remainingNodes.length) {
			remainingNodes = remainingNodes.filter(a => !toEliminate.includes(a));
			if (remainingNodes.length) {
				var minFamNode = null; /// Node with smallest family
				var minFamSize = Infinity;
				for (var node of remainingNodes) {
					var currentFamSize = node.parents.length + node.children.length;
					if (currentFamSize < minFamSize) {
						minFamNode = node;
						minFamSize = currentFamSize;
					}
				}
				
				/// Connect this node's family (ONLY including variables not yet
				/// eliminated)
				var fam = node.parents.concat(node.children).filter(a => remainingNodes.includes(a));
				this.connectNodes(fam);
				
				/// We can't create simplicial nodes outside of the family we just connected,
				/// so restrict search to family
				toEliminate = [minFamNode, ...this.findSimplicialNodes(fam)];
			}
		}
	},
	
	makeJoinTree() {
		/// Create a new graph (using 'connected' property)
		/// so we can destroy it to create the join tree
		var graph = this.bn.nodes.slice();
		for (var node of graph) {
			node.connected = node.parents.concat(node.children);
		}
		
		console.log("CONNECTEDS:", graph.map(a=>a.id+": "+a.connected.map(a=>a.id).join(",")));
		
		var _this = this;
		function findSimplicial() {
			for (var node of graph) {
				if (_this.checkConnected(node.connected, (a,b)=> a.connected.includes(b))) {
					return node;
				}
			}
		}
		
		function eliminate(node) {
			for (var c of node.connected) {
				c.connected.splice(c.connected.indexOf(node), 1);
			}
			node.connected = null;
			graph.splice(graph.indexOf(node), 1);
		}
		
		function subset(a, b) {
			var bSet = new Set(b);
			for (var el of a) {
				if (!bSet.has(el))  return false;
			}
			return true;
		}
		
		var cliques = [];
		var currentI = 0;

		var node;
		var testI = 0;
		while ( (node = findSimplicial()) ) {
			if (testI++ > 100)  break;
			/// Not including node in family just yet
			var fam = node.connected.slice();

			var separator = [];
			var numElims = 1;
			for (var sibling of fam) {
				if (subset(sibling.connected, fam.concat([node]))) {
					/// If all neighbours are also in node's neighbours,
					/// it doesn't need to be in separator
					eliminate(sibling);
					numElims++;
				}
				else {
					/// Otherwise, add to separator
					separator.push(sibling);
				}
			}
			
			currentI += numElims;
			
			/// Add node into family
			fam.push(node);
			
			/// Remove from graph
			eliminate(node);
			
			/// Add clique and its associated separator (which may be empty)
			cliques.push({
				nodes: fam,
				i: currentI,
				separator: separator,
				parent: null,
			});
		}
		
		for (var i=0; i<cliques.length; i++) {
			for (var j=i+1; j<cliques.length; j++) {
				if (subset(cliques[i].separator, cliques[j].nodes)) {
					cliques[i].parent = cliques[j];
					break;
				}
			}
		}
		
		return cliques;
	},
	
	addChildren() {
		for (var node of this.bn.nodes) {
			if (!node.children)  node.children = [];
			for (var parent of node.parents) {
				if (!parent.children)  parent.children = [];
				parent.children.push(node);
			}
		}
	},
	
	compile() {
		/// Just easier to have parents and children both
		this.addChildren();
		
		this.connectParents();
		this.triangulate();
		return this.makeJoinTree();
	},
	
	test() {
		this.bn = makeBnForUpdates(currentBn);
		return this.compile();
		for (var node of this.bn.nodes) {
			//console.log(node);
			if (node.parents.length) {
				console.log(node.parents.map(a=>a.id).join(", "), '\u2192', node.id);
			}
		}
		var ret = new BN();
		for (var node of this.bn.nodes) {
			ret.addNode(node.id, ["s0","s1"]);
		}
		for (var node of this.bn.nodes) {
			ret.nodesById[node.id].addParents(node.parents.map(p=>p.id));
		}
		return ret;
	},
};

onmessage = function(e) {
	// Worker has been sent the BN
	if (e.data[0]==0) {
		JunctionTree.bn = makeBnForUpdates(e.data[1]);
		JunctionTree.compile();
	}
	//Worker has been sent the evidence (for belief update)
	else if (e.data[0]==1) {
		JunctionTree.updateBeliefs();
	}
}

