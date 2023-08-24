if (typeof(importScripts)!="undefined") {
	importScripts('definitions.js');
	importScripts('equationFunctions.js');
	importScripts('engineCommon.js');
	importScripts('utils.js');
}
else if (typeof(exports)!="undefined") {
	({Factor} = require('./definitions.js'));
}

/// May have to copy these inline
function isParent(node1, node2) {
	if (typeof(node2)=="string")  node2 = node1.net.nodesById[node2];

	return node2.parents.indexOf(node1)!=-1;
}
/*function hasAncestor(node1, nodes, includeThis) {
	if (typeof(nodes)!="object" || !('length' in nodes))  nodes = [nodes];
	for (var i=0; i<nodes.length; i++) {
		if (typeof(nodes[i])=="string")  nodes[i] = node1.net.nodesById[nodes[i]];
	}

	var toVisit = includeThis ? [node1] : node1.parents.slice();
	while (toVisit.length) {
		var curNode = toVisit.shift();
		if (nodes.indexOf(curNode)!=-1)  return true;
		toVisit = toVisit.concat(curNode.parents);
	}

	return false;
};*/
var isLinked = function(n1,n2) { return isParent(n1, n2) || isParent(n2, n1); };
var checkCycle = function(from, to) { return to.ancestors.has(from); };
function addArc(from, to) {
	to.parents.push(from);
	from.children.push(to);
}

class Clique {
	constructor(o = {}) {
		this.nodes = null;
		this.i = null;
		this.separator = null;
		this.parent = null;
		this.children = [];
		this.potentials = [];
		
		Object.assign(this, o);
	}
	
	getDomain() {
		return this.nodes.map(n => n.id);
	}
	
	getString() {
		if (Clique.useInitials)  return this.getStringInitials();
		return (this.parent ? " Parent: {"+this.parent.nodes.map(n=>n.id).join(" ")+"}" : "{Root}")
			+ " Sep[" + this.separator.nodes.map(n=>n.id) + "]"
			+ this.nodes.map(n=>n.id).join(" ");
	}

	getStringInitials() {
		return (this.parent ? " _"+this.parent.nodes.map(n=>n.id[0]).join("").toUpperCase()+"_" : "_root_")
			+ ' -> Sep_'+this.separator.nodes.map(n=>n.id[0].toUpperCase()).join('')+'_ -> '
			+ '_'+this.nodes.map(n=>n.id[0].toUpperCase()).join("")+'_';
	}
}
Clique.useInitials = false;

class Separator {
	constructor(o = {}) {
		this.nodes = [];
		this.potentialsUp = [];
		this.potentialsDown = [];
		
		Object.assign(this, o);
	}

	getDomain() {
		return this.nodes.map(n => n.id);
	}
}

class JunctionTree {
	constructor(bn = null) {
		this.originalBn = bn;
		/// An easy way to make a copy
		this.bn = makeBnForUpdates(bn);
		this.cliques = null;
	}
	
	getCliqueGraphString() {
		let roots = this.cliques.filter(c => c.parent===null);
		let str = 'digraph jtree {\n';
		for (let root of roots) {
			let cliquesToCheck = [root];
			while (cliquesToCheck.length) {
				let clique = cliquesToCheck.shift();
				let fromCliqueStr = '"' + clique.nodes.map(n => n.id).join(', ') +'"';
				for (let toClique of clique.children) {
					let toCliqueStr = '"' + toClique.nodes.map(n => n.id).join(', ') + '"';
					let sepStr = '"' + toClique.separator.getDomain().join(', ') + '"';
					str += '\t' + sepStr + ' [shape=box];\n';
					str += '\t' + fromCliqueStr + ' -> ' + sepStr + ';\n';
					str += '\t' + sepStr + ' -> ' + toCliqueStr + ';\n';
				}
				cliquesToCheck.push(...clique.children);
			}
		}
		str += '}\n';
		
		return str;
	}

	getBnString() {
		let str = 'digraph jtree {\n';
		for (let node of this.bn.nodes) {
			if (node.children.length) {
				str += node.id + ' -> {' + node.children.map(c => c.id).join(' ') + '};\n';
			}
		}
		str += '}\n';
		
		return str;
	}

	updateBeliefs(evidenceArr) {
		
	}
	
	connectParents() {
		//onsole.log("PRE:", this.getBnString());
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
		//onsole.log("POST:", this.getBnString());
	}
	
	checkConnected(connected, isLinkedFunc = isLinked) {
		for (var i=0; i<connected.length; i++) {
			for (var j=i+1; j<connected.length; j++) {
				if (!isLinkedFunc(connected[i], connected[j])) {
					return false;
				}
			}
		}
		return true;
	}
	
	connectNodes(nodes) {
		for (var i=0; i<nodes.length; i++) {
			for (var j=i+1; j<nodes.length; j++) {
				if (!isLinked(nodes[i],nodes[j])) {
					/// Direction doesn't matter, as graph is undirected anyway
					addArc(nodes[i], nodes[j]);
				}
			}
		}
	}
	
	findSimplicialNodes(nodes) {
		var simplicialNodes = [];
		for (var node of nodes) {
			var connected = node.parents.concat(node.children);
			if (this.checkConnected(connected)) {
				simplicialNodes.push(node);
			}
		}
		return simplicialNodes;
	}
	
	triangulate() {
		console.log(this.getBnString());
		let remainingNodes = this.bn.nodes.slice();
		let toEliminate = this.findSimplicialNodes(remainingNodes);
		while (remainingNodes.length) {
			remainingNodes = remainingNodes.filter(a => !toEliminate.includes(a));
			if (remainingNodes.length) {
				let minFamNode = null; /// Node with smallest family
				let minFamSize = Infinity;
				for (let node of remainingNodes) {
					let currentFamSize = node.parents.length + node.children.length;
					if (currentFamSize < minFamSize) {
						minFamNode = node;
						minFamSize = currentFamSize;
					}
				}
				
				/// Connect this node's family (ONLY including variables not yet
				/// eliminated)
				let fam = minFamNode.parents.concat(minFamNode.children).filter(a => remainingNodes.includes(a));
				this.connectNodes(fam);
				
				/// We can't create simplicial nodes outside of the family we just connected,
				/// so restrict search to family
				toEliminate = [minFamNode, ...this.findSimplicialNodes(fam)];
			}
		}
		console.log("Triangulated: " + this.getBnString());
	}
	
	makeJoinTree() {
		/// Create a new graph (using 'connected' property)
		/// so we can destroy it to create the join tree
		let graph = this.bn.nodes.slice();
		for (let node of graph) {
			node.connected = node.parents.concat(node.children);
		}
		
		//console.log("CONNECTEDS:", graph.map(a=>a.id+": "+a.connected.map(a=>a.id).join(",")));
		
		let _this = this;
		function findSimplicial() {
			for (let node of graph) {
				if (_this.checkConnected(node.connected, (a,b)=> a.connected.includes(b))) {
					return node;
				}
			}
		}
		
		function eliminate(node) {
			for (let c of node.connected) {
				c.connected.splice(c.connected.indexOf(node), 1);
			}
			node.connected = null;
			graph.splice(graph.indexOf(node), 1);
		}
		
		function subset(a, b) {
			let bSet = new Set(b);
			for (let el of a) {
				if (!bSet.has(el))  return false;
			}
			return true;
		}
		
		let cliques = [];
		let currentI = 0;

		let node;
		let testI = 0;
		while ( (node = findSimplicial()) ) {
			if (testI++ > 100) {
				console.log("Exceeded findSimplicial count in makeJoinTree");
				break;
			}
			/// Not including node in family just yet
			let fam = node.connected.slice();

			let separator = new Separator();
			let numElims = 1;
			for (let sibling of fam) {
				if (subset(sibling.connected, fam.concat([node]))) {
					/// If all neighbours are also in node's neighbours,
					/// it doesn't need to be in separator
					eliminate(sibling);
					//console.log("eliminate sibling:", sibling.id);
					numElims++;
				}
				else {
					/// Otherwise, add to separator
					separator.nodes.push(sibling);
				}
			}
			
			currentI += numElims;
			
			/// Add node into family
			fam.push(node);
			
			/// Remove from graph
			eliminate(node);
			//console.log("eliminate node:", node.id, fam);
			
			/// Add clique and its associated separator (which may be empty)
			cliques.push(new Clique({
				nodes: fam,
				i: currentI,
				/// The separator set is what separates this clique from its *parent*
				separator: separator,
				parent: null,
				children: [],
			}));
		}
		
		//console.log('cliques:', cliques);

		/*let toSwap = [];
		let toRemove = [];
		for (let [i,clique] of cliques.entries()) {
			for (let [j,otherClique] of cliques.entries()) {
				if (clique == otherClique)  continue;
				if (subset(clique.nodes, otherClique.nodes)) {
					if (i < j) {
						toRemove.push(i);
					}
					else {
						toSwap.push([i,j]);
						toRemove.unshift(j);
					}
					/// xxx
					otherClique.separator = clique.separator;
				}
			}
		}
		for (let [i,j] of toSwap) {
			let a = cliques[i];
			cliques[i] = cliques[j];
			cliques[j] = a;
		}
		for (let i of toRemove.sort((a,b)=>b-a)) {
			cliques.splice(i, 1);
		}*/
		
		/// Make the cliques point to each other for the tree relationship
		for (let i=0; i<cliques.length; i++) {
			for (let j=i+1; j<cliques.length; j++) {
				if (subset(cliques[i].separator.nodes, cliques[j].nodes)) {
					cliques[i].parent = cliques[j];
					cliques[j].children.push(cliques[i]);
					break;
				}
			}
		}
		
		return cliques;
	}
	
	addChildren() {
		/// Clear out the children if they're there
		for (let node of this.bn.nodes)  node.children = [];
		/// Add children
		for (let node of this.bn.nodes) {
			if (!node.children)  node.children = [];
			for (let parent of node.parents) {
				if (!parent.children)  parent.children = [];
				parent.children.push(node);
			}
		}
	}
	
	addAncestors() {
		/// Clear out ancestors if they're there
		for (let node of this.bn.nodes)  node.ancestors = [];
		/// Add ancestors
		for (let node of this.bn.nodes) {
			node.ancestors = node.parents.slice();
			for (let i=0; i<node.ancestors.length; i++) {
				node.ancestors.push(...node.ancestors[i].parents);
			}
			node.ancestors = new Set(node.ancestors);
		}
	}
	
	compile() {
		//console.log('COMPILING');
		/// Just easier to have parents and children both
		this.addChildren();
		
		/// And in fact all ancestors, so we compute them just once for cycle checking
		this.addAncestors();
		
		this.connectParents();
		this.triangulate();
		this.cliques = this.makeJoinTree();
		
		return this.cliques;
	}
	
	multiply(potentials) {
		/*if (!window.numMultiples) { window.numMultiples = 0; window.numGt1 = 0; }
		console.log('multiply:', potentials.map(p => p.getDomain().join(',')).join(' x '), ++window.numMultiples, 'n'+potentials.length);
		if (potentials.length>2)  window.numGt1++;*/
		/*let potentials2 = potentials.filter(p => !p.isUnitPotential());
		if (potentials2 == 0)  return potentials[0];
		potentials = potentials2;*/
		/*console.log(potentials);
		let filteredPotentials = potentials.filter(p => !p.isUnitPotential && !p.isUnitPotential());
		if (!filteredPotentials.length) {
			filteredPotentials = potentials.slice(0,1);
		}
		potentials = filteredPotentials;
		console.log(potentials);*/
		
		potentials.sort((a,b) => a.size()-b.size());
		let newPotential = potentials[0].def ? Factor.fromDef(potentials[0]) : potentials[0];
		for (let i=1; i<potentials.length; i++) {
			let potential = potentials[i];
			if (potential.def) {
				/// Convert any CPTs to plain potentials
				potential = Factor.fromDef(potential);
			}
			newPotential = newPotential.multiplyFaster(potential, this.factorCache);
			//newPotential = Factor.multiplyAndMarginalize([newPotential, potential], []);
		}
		/*function sortQ() {
			potentialQ.sort((a,b) => a.size()-b.size());
		}
		let potentialQ = potentials.slice();
		while (potentialQ.length >= 2) {
			sortQ();
			let p1 = potentialQ.shift();
			let p2 = potentialQ.shift();
			potentialQ.push( p1.multiply(p2) );
		}*/
		
		//return potentialQ[0];
		return newPotential;
	}

	marginalize(item, itemToRemove) {
		/// If CPT, convert first
		if (item.def) {
			item = Factor.fromDef(item);
		}
		
		return item.marginalize1(itemToRemove, this.factorCache);
	}
	
	/// translation from friedman to kohler:
	/// potential = factor
	/// domain = scope
	reducePotentials(potentials, nodeIds) {
		let N = id => id ? id[0].toUpperCase() : id;
		//console.log(potentials.map(p => p.getDomain().map(v=>N(v)).join("")) + " down to " + nodeIds.map(v=>N(v)).join(""));
		
		//onsole.log("pre-filtered:", potentials);
		/// Drop unit potentials if possible (this has a significant beneficial performance impact)
		/// Wow, this was tricky to work out. You can't just filter out unit potentials,
		/// you have to make sure that each node id still exists. But to get the speed benefit,
		/// you can't just keep potentials whose domains cover the nodes needed. You need to
		/// create new, small, (independent) unit potentials
		let keptPotentials = [];
		let nodeIdsMissing = new Set(nodeIds);
		for (let potential of potentials) {
			if (!potential.isUnitPotential || !potential.isUnitPotential()) {
				keptPotentials.push(potential);
				potential.getDomain().forEach(nodeId => nodeIdsMissing.delete(nodeId));
			}
		}
		
		/// Create one-node unit potentials for every missing node
		for (let nodeId of nodeIdsMissing) {
			let f = new Factor();
			let numStates = this.bn.nodesById[nodeId].states.length;
			let values = new Float32Array(new ArrayBuffer(numStates*4));
			values.fill(1);
			f.make([nodeId], [numStates], values);
			keptPotentials.push(f);
		}
		
		potentials = keptPotentials;
		
		/// Remove 0 entries
		//potentials = potentials.map(p => p.reduceZeros());
		
		/// Find the variables that need to be removed
		/// (Which is the opposite of the nodes to keep)
		/// Also, note how many terms (potentials) they appear in
		let terms = {};
		let termSizes = {};
		let nodeIdSet = new Set(nodeIds);
		for (let potential of potentials) {
			let toRemoveCurrent = new Set(potential.getDomain()).difference(nodeIdSet);
			for (let id of toRemoveCurrent) {
				if (!terms[id]) { terms[id] = 0; termSizes[id] = 1; }
				terms[id]++;
				termSizes[id] *= potential.size();
			}
		}
		
		/// Remove variables that appear in the least number of terms first
		/// (Memory usage optimisation)
		/// XXX-todo: Take into account potential sizes
		let toRemove = Object.entries(termSizes).sort((a,b) => a[1] - b[1]);
		//let toRemove = Object.entries(terms);
		
		/// Copy
		potentials = [...potentials];		
		for (let i=0; i<toRemove.length; i++) {
			let id = toRemove[i][0];
			let newPotential = null;
			if (terms[id] == 1) {
				/// Find all matching potentials and remove potentials from list
				for (let j=0; j<potentials.length; j++) {
					if (potentials[j].getDomain().includes(id)) {
						newPotential = potentials[j];
						potentials[j] = null;
						break;
					}
				}
				potentials = potentials.filter(v => v!==null);
			}
			else {
				/// Find all matching potentials and remove potentials from list
				let toMultiply = [];
				for (let j=0; j<potentials.length; j++) {
					if (potentials[j].getDomain().includes(id)) {
						toMultiply.push(potentials[j]);
						potentials[j] = null;
					}
				}
				potentials = potentials.filter(v => v!==null);
				
				
				/// Multiply
				//console.log(toMultiply);
				newPotential = this.multiply(toMultiply);
			}
			
			/// Marginalize
			newPotential = this.marginalize(newPotential, id);

			/*/// Find all matching potentials and remove potentials from list
			let toMultiply = [];
			for (let j=0; j<potentials.length; j++) {
				if (potentials[j].getDomain().includes(id)) {
					toMultiply.push(potentials[j]);
					potentials[j] = null;
				}
			}
			potentials = potentials.filter(v => v!==null);
			
			let newPotential = Factor.multiplyAndMarginalize(toMultiply, [id]);*/
			
			potentials.push(newPotential);
		}
		
		return potentials;
	}
	
	propagate(evidence = {}) {
		this.factorCache = {};
		
		/// Go through and erase all potentials first
		for (let clique of this.cliques) {
			clique.potentials.length = 0;
			clique.separator.potentialsUp.length = 0;
			clique.separator.potentialsDown.length = 0;
		}
		
		/// Create potentials from each node's CPT, as well as the
		/// the evidence
		let potentials = [...this.originalBn.nodes.map(n => Factor.fromDef(n.def))];
		
		this.addEvidence(evidence);
		
		/// For each potential, attach to at least 1 matching clique
		for (let potential of potentials) {
			//console.log(potential);
			//debugger;
			for (let clique of this.cliques) {
				//console.log(clique.getDomain(),potential.getDomain());
				if (new Set(clique.getDomain()).isSuperset(potential.getDomain())) {
					clique.potentials.push(potential);
					break;
				}
			}
		}
		
		/*for (let clique of this.cliques) {
			console.log(clique.getString());
			console.log(clique.potentials.map(p => p.id +'('+p.getDomain().join(',')+')'));
		}
		//debugger;
		console.log('done');*/
		
		/// Sort cliques topologically
		/// Get root
		let cliquesToCheck = [this.cliques.find(c => c.parent === null)];
		//console.log('cliquesToCheck', cliquesToCheck.length);
		let sortedCliques = [];
		while (cliquesToCheck.length) {
			let nextClique = cliquesToCheck.shift();
			sortedCliques.push( nextClique );
			cliquesToCheck.push(...nextClique.children);
		}
		/// Reverse topological sort of the cliques (leaves -> root)
		let reverseSortedCliques = sortedCliques.slice().reverse();
		
		//ounters.log('pre');
		
		//onsole.log('digraph jtree { '+sortedCliques.map(c => c.getString()).join('; ')+' } ');
		//console.log('digraph jtree { '+reverseSortedCliques.map(c => c.getString()).join('; ')+' } ');
		
		/// NOTE: Everything above can go into a |compileParameters| phase, which comes after |compileStructure|,
		/// and if structure doesn't change (but params do), then only |compileParameters| needs to be run
		
		/// For each clique:
			/// Get the clique's potentials + all the separator's potentials (for all separators
			/// in this -> sep -> children)
			/// Reduce to the variables used by its attached up separator (which links to this's parent)
			/// Push the reduction up to the parent clique (there's only ever 1 parent)
		for (let clique of reverseSortedCliques) {
			let totalPotentials = [...clique.potentials];
			for (let childClique of clique.children) {
				totalPotentials.push(...childClique.separator.potentialsUp);
			}
			//console.log('reducing...', totalPotentials.map(p => p.vars ? p.vars.join(',') : '['+p.id+']'));
			//console.log('to...', clique.separator.getDomain());
			let sepPotentials = this.reducePotentials(totalPotentials, clique.separator.getDomain());
			clique.separator.potentialsUp.push(...sepPotentials);
		}
		
		//ounters.log('after up');
		/// Forward topological sort of the cliques (root -> leaves)
		
		/// For each clique:
			/// Get the clique's potentials + all potentials in separator identified by 
			/// this -> sep -> parent
			/// For every child:
				/// Reduce the above potentials to the variables used by the separator attached to the *child*
				/// (Note, this will be different for each child)
				/// Push the reduction into the child clique (into potentialsDown)
		for (let clique of sortedCliques) {
			let totalPotentials = [...clique.potentials];
			totalPotentials.push(...clique.separator.potentialsDown);
			for (let childClique of clique.children) {
				/// We need to combine with all the up messages from the other children
				let siblingCliques = clique.children.filter(c => c !== childClique);
				let thisChildsPotentials = [...totalPotentials];
				siblingCliques.forEach(c => thisChildsPotentials.push(...c.separator.potentialsUp));
				let sepPotentials = this.reducePotentials(thisChildsPotentials, childClique.separator.getDomain());
				childClique.separator.potentialsDown.push(...sepPotentials);
			}
		}

		//ounters.log('after down');
		/// -> We now have a full junction tree!
		
		/// For every node:
			/// Select a clique that contains the node
			/// Reduce to just the node
			/// Normalize?
			/// Store the beliefs
		let nodeBeliefs = {};
		for (let node of this.originalBn.nodes) {
			//console.log("node.id", node.id, sortedCliques);
			/// Find a clique with the node (replace with something better)
			for (let clique of sortedCliques) {
				//console.log(node.id, clique.getDomain().join(','));
				if (clique.getDomain().includes(node.id)) {
					//console.log('Found a clique!', node.id, clique.getDomain());
					/// Collect all relevant potentials, multiply them, and marginalize down
					let totalPotentials = [...clique.potentials, ...clique.separator.potentialsDown];
					for (let childClique of clique.children) {
						totalPotentials.push(...childClique.separator.potentialsUp);
					}
					//onsole.log(clique.potentials, clique.separator.potentialsDown, totalPotentials);
					let idPotential = this.reducePotentials(totalPotentials, [node.id]);
					//onsole.log('idPotential:', idPotential);
					/// May still have multiple potentials, so multiply if so
					if (idPotential.length>1)  idPotential = this.multiply(idPotential);
					else  idPotential = idPotential[0];
					/// Convert to factor, which should have been done right at the beginning!
					idPotential = idPotential.def ? Factor.fromDef(idPotential.def) : idPotential;
					let beliefs = normalize(idPotential.values);
					nodeBeliefs[node.id] = beliefs;
					break;
				}
			}
		}
		
		//ounters.log('end');
		//onsole.log(nodeBeliefs);
		
		/// Done!
		return nodeBeliefs;
	}
	
	addEvidence(evidence) {
		for (let [nodeId,state] of Object.entries(evidence)) {
			let node = this.bn.nodesById[nodeId];
			let f = new Factor();
			let values = new Float32Array(new ArrayBuffer(4*node.states.length));
			values[state] = 1;
			f.make([node.id], [node.states.length], values);
			for (let clique of this.cliques) {
				if (clique.getDomain().includes(node.id)) {
					clique.potentials.push(f);
					break;
				}
			}
		}
	}
	
	/// Don't know if I'll need this
	clearEvidence() {
		
	}
	
	static test() {
		let jtree = new JunctionTree(currentBn);
		/*
		/// test marginalize
		let cancer = this.bn.nodes[2];
		let pollution = this.bn.nodes[0];
		window.mcancer = this.marginalize(cancer, pollution);
		return;*/
		console.time('compile');
		jtree.compile();
		console.timeEnd('compile');
		let cliqueStr = jtree.cliques.map(c => c.getString()).join(" --- ");
		console.log(cliqueStr);
		console.time('propagate');
		jtree.propagate(currentBn.evidence);
		console.timeEnd('propagate');
		console.time('propagate');
		jtree.propagate();
		console.timeEnd('propagate');
		return;
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
	}
};

junctionTree = null;
onmessage = function(e) {
	//onsole.log(junctionTree);
	// Worker has been sent the BN
	if (e.data[0]==0) {
		junctionTree = new JunctionTree(makeBnForUpdates(e.data[1]));
		junctionTree.compile();
	}
	//Worker has been sent the evidence (for belief update)
	else if (e.data[0]==1) {
		var evidenceArr = e.data[1];
		/// I'm converting back and forth needlessly here
		var evidence = {};
		for (let i=0; i<junctionTree.originalBn.nodes.length; i++) {
			let node = junctionTree.originalBn.nodes[i];
			evidence[node.id] = evidenceArr[i];
		}
		let beliefs = junctionTree.propagate(evidence);
		let allBeliefs = [];
		for (let [nodeId,bels] of Object.entries(beliefs)) {
			allBeliefs.push(bels);
		}
		postMessage([0,allBeliefs]);
	}
	//onsole.log(junctionTree);
}

if (typeof(exports)!='undefined') {
	Object.assign(exports, {JunctionTree});
}