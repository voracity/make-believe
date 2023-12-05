if (typeof(importScripts)!="undefined") {
	importScripts('utils.js');
	importScripts('definitions.js');
	importScripts('equationFunctions.js');
	importScripts('engineCommon.js');
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
	static num = 0;
	constructor(o = {}) {
		this.cliqueNum = Clique.num++;
		this.nodes = null;
		this.i = null;
		this.separator = null;
		this.parent = null;
		this.children = [];
		this.potentials = [];
		
		Object.assign(this, o);
	}
	
	getSize() {
		return this.potentials.reduce((a,v)=>a*v.size(),1);
	}
	
	getNodeCombinationSize() {
		return this.nodes.reduce((a,n)=>a*n.states.length,1);
	}
	
	getFullSize() {
		let clique = this;
		let totalPotentials = [...clique.potentials, ...clique.separator.potentialsDown];
		for (let childClique of clique.children) {
			totalPotentials.push(...childClique.separator.potentialsUp);
		}
		return totalPotentials.reduce((a,v)=>a*v.size(),1);
	}
	
	getDomain() {
		return this.nodes.map(n => n.id);
	}
	
	getString() {
		if (Clique.useInitials)  return this.getStringInitials();
		return (this.parent ? " Parent:{"+this.parent.nodes.map(n=>n.id).join(" ")+"}" : "{Root}")
			+ " Sep[" + this.separator.nodes.map(n=>n.id) + "] "
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
	
	getCliqueGraphString(o = {}) {
		o.highlightPotentials ??= false;
		
		let cliqueId = c => '#'+c.cliqueNum+' '+c.nodes.map(n => n.id).join(',');
		let cliqueIdFormat = c => wrapText('#'+c.cliqueNum+' '+c.nodes.map(n => {
			let cliqueHasPotential = c.potentials.map(p=>p.unconditionals).flat().includes(n.id);
			if (cliqueHasPotential) {
				return `<font color="red">${n.id}</font>`;
			}
			return n.id;
		}).join(', '), 30).replace(/\n/g, '<br/>')+`<br/>Size: ${Number(c.getNodeCombinationSize()).toLocaleString()}`;
		let sepId = (p,c) => '#' + p.cliqueNum + ' ' + c.separator.getDomain().join(', ') + ''
		
		let formatting = _=> {
			if (o.highlightPotentials) {
				return this.cliques.map(c => {
					return `\t"${cliqueId(c)}" [label=<${cliqueIdFormat(c)}>];\n` +
						(c.parent ? `\t"${sepId(c.parent, c)}" [label=<${wrapText(sepId(c.parent, c), 30).replace(/\n/g, '<br/>')}>];\n` : '')
				}).join('');
			}
			return '';
		};
		
		let roots = this.cliques.filter(c => c.parent===null);
		let str = 'digraph jtree {\n';
		str += formatting();
		for (let root of roots) {
			let cliquesToCheck = [root];
			while (cliquesToCheck.length) {
				let clique = cliquesToCheck.shift();
				let fromCliqueStr = '"' + cliqueId(clique) +'"';
				for (let toClique of clique.children) {
					let toCliqueStr = '"' + cliqueId(toClique) + '"';
					let sepStr = '"'+sepId(clique, toClique)+'"';
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
		let getFam = n => n.parents.concat(n.children);
		let famSize = n => n.parents.length+n.children.length;
		let famSizeRem = n => getFam(n).filter(m => remainingNodes.includes(m)).length;
		let toEliminate = this.findSimplicialNodes(remainingNodes);
		let selected = new Set();
		let minDegree = nodes => nodes.reduce((a,n)=>famSize(n)<famSize(a)?n:a);
		let minDegreeRemaining = nodes => nodes.reduce((a,n)=>famSizeRem(n)<famSizeRem(a)?n:a);
		let minFill = nodes => {
			let minFilled = Infinity;
			let minNode = null;
			for (let node of nodes) {
				let fam = getFam(node).filter(n => remainingNodes.includes(n));
				let countNotLinked = 0;
				for (let i=0; i<fam.length; i++) {
					for (let j=i+1; j<fam.length; j++) {
						countNotLinked += !isLinked(fam[i],fam[j]);
					}
				}
				if (countNotLinked < minFilled) {
					minFilled = countNotLinked;
					minNode = node;
				}
			}
			console.log({minFilled});
			return minNode;
		};
		while (remainingNodes.length) {
			remainingNodes = remainingNodes.filter(a => !toEliminate.includes(a));
			if (remainingNodes.length) {
				/// I think I'm getting this very wrong. It performs horribly.
				let maxCardinality = nodes => {
					let maxCard = -Infinity;
					let maxNode = null;
					let minNeigh = Infinity;
					for  (let node of nodes) {
						let fam = getFam(node);
						let selectedFam = fam.filter(n => selected.has(n));
						let neighborsSelected = selectedFam.length;
						if (neighborsSelected > maxCard) {
							maxCard = neighborsSelected;
							maxNode = node;
							minNeigh = fam.length;
						}
						else if (neighborsSelected == maxCard && fam.length < minNeigh) {
							maxCard = neighborsSelected;
							maxNode = node;
							minNeigh = fam.length;
						}
					}
					console.log(maxCard);
					selected.add(maxNode);
					return maxNode;
				};
				// let minFamNode = null; /// Node with smallest family
				// let minFamSize = Infinity;
				// for (let node of remainingNodes) {
					// let currentFamSize = node.parents.length + node.children.length;
					// if (currentFamSize < minFamSize) {
						// minFamNode = node;
						// minFamSize = currentFamSize;
					// }
				// }
				let choiceOpts = {
					minDegree,
					minDegreeRemaining,
					minFill,
				};
				let getBestNode = choiceOpts[this.options.triangulationChoice];
				let nextNode = getBestNode(remainingNodes);
				
				/// Connect this node's family (ONLY including variables not yet
				/// eliminated)
				let fam = getFam(nextNode).filter(a => remainingNodes.includes(a));
				this.connectNodes(fam);
				
				/// We can't create simplicial nodes outside of the family we just connected,
				/// so restrict search to family
				toEliminate = [nextNode, ...this.findSimplicialNodes(fam)];
			}
		}
		console.log("Triangulated: " + this.getBnString());
	}
	
	makeJoinTree() {
		/// Create a new graph (using 'connected' property)
		/// so we can destroy it to create the join tree
		console.log('MAKIE');
		let graph = this.bn.nodes.slice();
		for (let node of graph) {
			node.connected = node.parents.concat(node.children);
		}
		
		//console.log("CONNECTEDS:", graph.map(a=>a.id+": "+a.connected.map(a=>a.id).join(",")));
		
		// let checkConnected = nodes => {
			// for (var i=0; i<nodes.length; i++) {
				// for (var j=i+1; j<nodes.length; j++) {
					// if (!isLinked(nodes[i], nodes[j])) {
						// return false;
					// }
				// }
			// }
			// return true;
		// };
		
		let checkConnected = nodes => this.checkConnected(nodes, (a,b)=> a.connected.includes(b));
		
		let _this = this;
		let findSimplicial = null;
		let findSimplicialLookahead = () => {
			let maxConverted = -Infinity;
			let minConnected = Infinity;
			let maxNode = null;
			let isSimplicial = new Set();
			for (let node of graph) {
				if (checkConnected(node.connected))  isSimplicial.add(node);
			}
			for (let node of isSimplicial) {
				let nonsimplicialNeighbors = node.connected.filter(n=>!isSimplicial.has(n));
				let conversionCount = 0;
				for (let neigh of nonsimplicialNeighbors) {
					if (checkConnected(neigh.connected.filter(v => v!=node))) {
						conversionCount++;
					}
				}
				if (conversionCount > maxConverted) {
					maxConverted = conversionCount;
					maxNode = node;
					minConnected = node.connected.length;
				}
				else if (conversionCount == maxConverted && node.connected.length < minConnected) {
					maxNode = node;
					minConnected = node.connected.length;
				}
			}
			return maxNode;
		}
		let findSimplicialMinDegree = () => {
			let minSize = Infinity;
			let minNode = null;
			let cliqueSizes = new Map();
			for (let node of graph) {
				if (checkConnected(node.connected)) {
					cliqueSizes.set(node, node.connected.concat(node).reduce((a,n)=>a*n.states.length,1));
				}
			}
			let maxCliqueSize = Math.max(...cliqueSizes.values());
			dbg(_=>console.log('mcs:',maxCliqueSize));
			for (let node of graph) {
				if (checkConnected(node.connected)) {
					if (node.connected.length < minSize) {
						minSize = node.connected.length;
						minNode = node;
					}
				}
			}
			return minNode;
		}
		let findSimplicialTreeWidth = () => {
			let minNode = null;
			dbg(_=>{
				let cliqueSizes = new Map();
				for (let node of graph) {
					if (checkConnected(node.connected)) {
						cliqueSizes.set(node, node.connected.concat(node).reduce((a,n)=>a*n.states.length,1));
					}
				}
				let maxCliqueSize = Math.max(...cliqueSizes.values());
				console.log('mcs:',maxCliqueSize);
				let newMaxCliqueSizes = new Map();
				for (let node of cliqueSizes.keys()) {
					let newMaxSize = -Infinity;
					for (let otherNode of graph) {
						let withoutNode = otherNode.connected.filter(v=>v!=node);
						if (checkConnected(withoutNode)) {
							let newCliqueSize = withoutNode.reduce((a,n)=>a*n.states.length,1);
							newMaxSize = newCliqueSize > newMaxSize ? newCliqueSize : newMaxSize;
						}
					}
					newMaxCliqueSizes.set(node, newMaxSize);
				}
				newMaxCliqueSizes = new Map([...newMaxCliqueSizes.entries()].sort((a,b)=>a[1]-b[1]));
				console.log(newMaxCliqueSizes);
				let minSize = Infinity;
				let lastSize = Infinity;
				for (let [node,size] of newMaxCliqueSizes) {
					if (size>lastSize)  break;
					if (node.connected.length < minSize) {
						minSize = node.connected.length;
						minNode = node;
					}
				}
			});
			return minNode;
		}
		let findSimplicialMaxDegree = () => {
			let maxSize = -Infinity;
			let maxNode = null;
			for (let node of graph) {
				if (checkConnected(node.connected)) {
					if (node.connected.length > maxSize) {
						maxSize = node.connected.length;
						maxNode = node;
					}
				}
			}
			return maxNode;
		}
		let findSimplicialArbitrary = () => {
			for (let node of graph) {
				if (checkConnected(node.connected)) {
					return node;
				}
			}
		}
		let findOpts = {arbitrary: findSimplicialArbitrary,
			lookahead: findSimplicialLookahead,
			minDegree: findSimplicialMinDegree,
			maxDegree: findSimplicialMaxDegree,
			treeWidth: findSimplicialTreeWidth,
		}
		findSimplicial = findOpts[this.options.simplicialChoice];
		// console.log(this.options.elimChoice, findSimplicial.toString());
		
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
		
		this.jtreeInfo();
		
		return this.cliques;
	}
	
	findMultiplied(potentials) {
		if (!this.mulCache)  return potentials;
		
		let _fm = potentials => {
		
			let remPotentials = [];
			let seen = new Set();
			
			//let sortedPotentials = potentials.toSorted((a,b) => a.factorNum - b.factorNum);
			let sortedPotentials = potentials;
			outer: for (let [i,potential] of sortedPotentials.entries()) {
				if (seen.has(potential))  continue;
				let otherMap = this.mulCache.get(potential);
				if (otherMap) {
					for (let j=i+1; j<sortedPotentials.length; j++) {
						let res = otherMap.get(sortedPotentials[j]);
						if (res) {
							remPotentials.push(res);
							seen.add(sortedPotentials[j]);
							counters.multiplyHit++;
							console.log('hit');
							continue outer;
						}
					}
				}
				remPotentials.push(potential);
			}
			
			if (remPotentials.length < potentials.length) {
				console.log('xxg');
				return _fm(remPotentials);
			}
			
			return remPotentials;
		}
		
		return _fm(potentials);
	}
	
	addMultiplied(p1, p2, res) {
		// if (p2.factorNum < p1.factorNum)  [p2,p1] = [p1,p2]; // Is this supposed to be commented out?
		dbg(_=>{
			p1.childFactors.push(res);
			p2.childFactors.push(res);
		});

		if (this.options.factorCaching) {
			if (!this.mulCache)  this.mulCache = new Map();
			if (!this.mulCache.has(p1))  this.mulCache.set(p1, new Map());
			if (!this.mulCache.get(p1).has(p2))  this.mulCache.get(p1).set(p2, res);
		}
	}
	
	multiply(potentials) {
		counters.jtreeMultiply++;
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
		// potentials.sort((a,b) => a.factorNum - b.factorNum);
		potentials = this.findMultiplied(potentials);
		let newPotential = potentials[0];//.def ? Factor.fromDef(potentials[0]) : potentials[0];
		// console.log('pre-size:',potentials.map(p => p.size()),potentials.reduce((a,p) => a*p.size(),1));
		// console.log('mulling:',potentials.map(p=>p.factorNum));
		// console.log('domains:',potentials.map(p=>p.getDomain()));
		for (let i=1; i<potentials.length; i++) {
			let potential = potentials[i];
			/*if (potential.def) {
				/// Convert any CPTs to plain potentials
				potential = Factor.fromDef(potential);
			}*/
			let newPotentialRes = null;
			if (this.options.useUnitPotentials && potential.isUnitPotential()) {
				counters.unitPotentials++;
				newPotentialRes = newPotential.addVars(potential.vars, potential.varNumStates, potential.values[0], potential.conditional, potential.activeStates);
				// /// This kind of maybe works, except when it doesn't. (Possibly when marginalising down to root nodes?)
				// newPotentialRes = newPotential;
			}
			else {
				// newPotential = newPotential.isUnitPotential() ? potential : potential.isUnitPotential() ? newPotential : newPotential.multiplyFaster(potential, this.factorCache);
				newPotentialRes = newPotential.multiplyFaster4(potential);
				// let f3 = newPotential.multiplyFaster3(potential).moveVarsToStart(newPotentialRes.vars);
				// if (!f3.values.reduce((a,v,i)=>a && v==newPotentialRes.values[i],true)) {
					// debugger;
				// }
			}
			this.addMultiplied(newPotential, potential, newPotentialRes);
			newPotential = newPotentialRes;
			//newPotential = Factor.multiplyAndMarginalize([newPotential, potential], []);
		}
		// console.log('post-size:',newPotential.size());
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
		newPotential.isUnitPotential();
		return Object.freeze(newPotential);
	}

	marginalize(potential, itemsToRemove) {
		counters.jtreeMarginalize++;
		/// If CPT, convert first XXX: not used now?
		if (potential.def) {
			potential = Factor.fromDef(potential);
		}
		if (!this.margCache)  this.margCache = new Map();
		
		let newPotential = null;
		if (itemsToRemove.length+1==potential.vars.length) {
			let itemCacheKey = itemsToRemove.join('|');
			if (!this.margCache.has(potential))  this.margCache.set(potential, new Map());
			if (this.margCache.get(potential).has(itemCacheKey)) {
				counters.marginalHit++;
				newPotential = this.margCache.get(potential).get(itemCacheKey);
			}
			else {
				let id = [...new Set(potential.vars).difference(itemsToRemove)][0];
				newPotential = potential.marginalizeToSingle(id);
				if (this.options.factorCaching) {
					this.margCache.get(potential).set(itemCacheKey, newPotential);
				}
			}
		}
		else {
			newPotential = potential;
			for (let id of itemsToRemove) {
				let origPotential = newPotential;
				if (!this.margCache.has(origPotential))  this.margCache.set(origPotential, new Map());
				if (this.margCache.get(origPotential).has(id)) {
					counters.marginalHit++;
					newPotential = this.margCache.get(origPotential).get(id);
				}
				else {
					newPotential = origPotential.marginalize1(id);
					if (this.options.factorCaching) {
						this.margCache.get(origPotential).set(id, newPotential);
					}
				}
			}
		}
		
		dbg(_=>potential.childFactors.push(newPotential));
		newPotential.isUnitPotential();
		return Object.freeze(newPotential);
	}
	
	reducePotentials2(potentials, nodeIds) {
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
		
		/// Use one-node unit potentials for every missing node
		for (let nodeId of nodeIdsMissing) {
			keptPotentials.push(this.unitPotentials[nodeId]);
		}
		
		// console.log('all potentials:', potentials, keptPotentials);
		
		if (this.options.useUnitPotentials)  potentials = keptPotentials;
		
		/// Find the variables that need to be removed
		/// (Which is the opposite of the nodes to keep)
		let nodeIdSet = new Set(nodeIds);
		let toRemoveIds = new Set();
		for (let potential of potentials) {
			toRemoveIds = toRemoveIds.union(new Set(potential.getDomain()).difference(nodeIdSet));
		}
		
		let fauxMultiply = (f1,f2) => {
			let [vars,varNumStates] = unzipObject(mergeObjects((a,b)=>a<b, zipObject(f1.vars, f1.varNumStates),zipObject(f2.vars, f2.varNumStates)));
			let size = varNumStates.reduce((a,v)=>a*v,1);
			return {vars,varNumStates,size(){return size}};
		}

		let opRemoveIds = new Set(toRemoveIds);
		/// Index all potentials by their ids
		let terms = {};
		potentials.forEach(p => p.getDomain().forEach(id => (terms[id]??=new Set()).add(p)));
		let opSummary = [];
		while (opRemoveIds.size) {
			/// Stage 1:
			/// See if there are factors we can marginalize now. If so, marginalize them
			let termEntries = Object.entries(terms).filter(te => opRemoveIds.has(te[0]));
			termEntries.sort((a,b)=>a[1].size-b[1].size);
			while (termEntries.length && termEntries[0][1].size==1) {
				let thisPotential = [...termEntries[0][1]][0];
				/// See if any of the other IDs can be marginalised as well (i.e. only 1 potential, and it's this potential)
				let allIds = termEntries.filter(([id,potentials]) => potentials.size==1 && [...potentials][0]==thisPotential).map(te=>te[0]);
				/// Marginalise the ids XXX: replace with multi-marginalise
				let curPotential = thisPotential;
				dbg(_=>opSummary.push(['Marg',curPotential.toStringShort(),allIds.join(', ')]));
				curPotential = this.marginalize(curPotential, allIds);
				/// Remove the ids we just marginalised from terms
				allIds.forEach(id => (delete terms[id],opRemoveIds.delete(id)));
				/// Replace the old potential with the new one in any other terms
				termEntries = Object.entries(terms);
				for (let [k,v] of termEntries) {
					if (v.has(thisPotential)) {
						v.add(curPotential).delete(thisPotential);
					}
				}
				termEntries = termEntries.filter(te => opRemoveIds.has(te[0]));
				termEntries.sort((a,b)=>a[1].size-b[1].size);
			}
			
			/// Stage 2:
			/// Find if there are any multiplications whose products are no bigger than the max size of
			/// the two multiplicands (regardless of where the factors appear!), and choose the one
			/// that results in the smallest sized product
			/// And if no such product, just find the smallest product
			let allPotentials = [...Object.values(terms).reduce((a,te)=>a.union(te),new Set())];
			let minPair = null;
			let minSize = Infinity;
			let overallMinPair = null;
			let overallMinSize = Infinity;
			/// n**2 in the number of potentials, but this should be tiny in comparison to multiplication
			/// Although, independence inside the factors might change that!
			for (let i=0; i<allPotentials.length; i++) {
				for (let j=i+1; j<allPotentials.length; j++) {
					let p1 = allPotentials[i];
					let p2 = allPotentials[j];
					/// Skip factors with nothing in common
					if (new Set(p1.getDomain()).intersection(p2.getDomain()).size==0)  continue;
					let productSize = fauxMultiply(p1,p2).size();
					if (productSize < minSize && (productSize <= p1.size() || productSize <= p2.size())) {
						minPair = [p1,p2];
						minSize = productSize;
					}
					if (productSize < overallMinSize) {
						overallMinPair = [p1,p2];
						overallMinSize = productSize;
					}
				}
			}
			let toMultiply = minPair ?? overallMinPair;
			if (toMultiply) {
				dbg(_=>opSummary.push(['Mul',toMultiply.map(p => p.toStringShort()).join(', ')]));
				let curPotential = this.multiply(toMultiply);
				for (let potential of toMultiply) {
					potential.getDomain().forEach(id => terms[id].add(curPotential).delete(potential));
				}
			}
		}
		dbg(c=>c('OP Summary:', opSummary));
		
		return [...Object.values(terms).reduce((a,v)=>a.union(v),new Set())];
	}
	
	/// translation from friedman to kohler:
	/// potential = factor
	/// domain = scope
	reducePotentials1(potentials, nodeIds) {
		let N = id => id ? id[0].toUpperCase() : id;
		// console.log(potentials.map(p => p.getDomain().map(v=>N(v)).join("")) + " down to " + nodeIds.map(v=>N(v)).join(""));
		
		// console.log("pre-filtered:", potentials);
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
		// console.log('missing:', nodeIdsMissing, new Set(potentials.map(p=>p.getDomain()).flat()));
		/*nodeIdsMissing = new Set(nodeIds);
		console.log('HALO');*/
		
		/// Use one-node unit potentials for every missing node
		for (let nodeId of nodeIdsMissing) {
			keptPotentials.push(this.unitPotentials[nodeId]);
		}
		
		// console.log('all potentials:', potentials, keptPotentials);
		
		if (this.options.useUnitPotentials)  potentials = keptPotentials;
		
		/// Remove 0 entries
		//potentials = potentials.map(p => p.reduceZeros());
		
		/// Find the variables that need to be removed
		/// (Which is the opposite of the nodes to keep)
		let nodeIdSet = new Set(nodeIds);
		let toRemoveIds = new Set();
		for (let potential of potentials) {
			toRemoveIds = toRemoveIds.union(new Set(potential.getDomain()).difference(nodeIdSet));
		}
		
		// console.log('vars needing removal:', toRemoveIds);

		let ops = [];
		// let MULTIPLY = 'Multiply', MARGINALIZE = 'Marginalize';
		let MULTIPLY = 0, MARGINALIZE = 1;
		
		let fauxMultiply = (f1,f2,pastResult) => {
			let [vars,varNumStates] = unzipObject(mergeObjects((a,b)=>a<b, zipObject(f1.vars, f1.varNumStates),zipObject(f2.vars, f2.varNumStates)));
			let size = varNumStates.reduce((a,v)=>a*v,1);
			return {vars,varNumStates,size,score:(f1.score??0)+size};
		}
		let fauxMarginalize = (f,id,pastResult) => {
			if (!f) {
				let reduction = 1/pastResult.varNumStates[pastResult.vars.indexOf(id)];
				return {vars:[id], varNumStates: [reduction], size: reduction, score:pastResult.size*reduction, score: 0};
			}
			let index = f.vars.indexOf(id); if (index==-1)  return null;
			let varNumStates = f.varNumStates.toSpliced(index,1);
			let size = f.varNumStates.reduce((a,v)=>a*v,1);
			return {vars: f.vars.toSpliced(index,1), varNumStates, size, score:(f.score??0)+size, score: size};
		}
		let estimateResultSumProductScore = (id,potentials,pastResult) => fauxMarginalize(potentials.length ? potentials.reduce((a,p) => fauxMultiply(a,p,a)) : null,id,pastResult);
		let estimateResultProductScore = (id,potentials,pastResult) => ({score:potentials.reduce((a,p)=>a*p.varNumStates.reduce((a,v)=>a*v,1),1)});
		// No idea why, but this produces the fastest results...
		let estimateResultNumTerms = (id,potentials,pastResult) => ({score:potentials.length});
		let estimateResult = estimateResultNumTerms;
		
		let opPotentials = new Set(potentials);
		let opRemoveIds = new Set(toRemoveIds);
		let pastResult = null;
		while (opRemoveIds.size) {
			let terms = {};
			opRemoveIds.forEach(id => terms[id] = []);
			/// Work out term counts
			for (let potential of opPotentials) {
				potential.getDomain().forEach(id => id in terms && terms[id].push(potential));
			}
			dbg(_=>_({terms}));
			// console.log('terms:',terms);
			// debugger;
			let termEntries = Object.entries(terms);
			if (termEntries.length==0)  {
				console.log('NO MORE TERMS');
				break;
			}
			let countActiveStates = (facs) => {
				return facs.map(f => f.activeStates.reduce((a,v) => v!=null ? a+1 : a,0)).reduce((a,v)=>a+v,0);
			};
			// console.log("terms:",terms);
			let res;
			let termEstimates = Object.fromEntries(termEntries.map(([id,potentials]) => [id,estimateResult(id,potentials,pastResult)]));
			console.log(termEstimates);
			let [marginalId,factors] = termEntries.reduce((a,v) => termEstimates[v[0]].score < termEstimates[a[0]].score ? v : a);
			pastResult = termEstimates[marginalId];
			// factors.sort((a,b)=>b.size()-a.size());
			// console.log(potentials.map(p => p.toStringNodes()));
			// if (potentials.length==7 && potentials[0].factorNum==0 && potentials[6].factorNum==10 && opRemoveIds.size==6) {
				// debugger;
			// }
			if (factors.length) {
				ops.push([MULTIPLY,factors]);
				opPotentials = opPotentials.difference(factors);
			}
			ops.push([MARGINALIZE,[marginalId]]);
			opRemoveIds.delete(marginalId);
		}
		/// If any opPotentials remaining, multiply them (or defer?)
		if (opPotentials.size) {
			ops.push([MULTIPLY, [...opPotentials]]);
		}
		// console.log("OPS:", ops);
		/// Collapse together adjacent marginalisations
		let newOps = [];
		let lastOp = [];
		for (let op of ops) {
			if (op[0]==MARGINALIZE && lastOp[0]==MARGINALIZE) {
				newOps.at(-1)[1].push(op[1]);
			}
			else {
				newOps.push(op);
			}
			lastOp = op;
		}
		
		ops = newOps;
		console.log('NEWOPS:',newOps);
		
		/// XXX: I don't think this has any positive effect whatsoever! (also broken with evidence)
		/// Remove marginalise of unconditionals
		let curUncond = new Set();
		let tempOps = ops;
		opsChanges: for (let i=0; i<tempOps.length; i++) {
			let op = tempOps[i];
			if (op[0]==MARGINALIZE) {
				if (curUncond.size==1 && [...curUncond][0]==op[1]) {
					tempOps = tempOps.slice(i+1);
					i = -1;
					curUncond = new Set();
				}
				else {
					curUncond.delete(op[1]);
				}
			}
			else if (op[0]==MULTIPLY) {
				for (let potential of op[1]) {
					if (potential.activeStates.reduce((a,v)=>v==null && a, true)) {
						curUncond = curUncond.union(potential.unconditionals);
					}
					else {
						break opsChanges;
					}
				}
			}
		}
		if (tempOps.length==0)  tempOps = [[[MULTIPLY], nodeIds.map(id => this.unitPotentials[id])]];
		
		let runOps = (ops) => {
			let currentFactor = null;
			for (let op of ops) {
				if (op[0]==MULTIPLY) {
					let factors = op[1];
					currentFactor = this.multiply(currentFactor ? factors.concat(currentFactor) : factors);
					// console.log(op);
					// console.log(currentFactor.toStringShort(), currentFactor);
				}
				else if (op[0]==MARGINALIZE) {
					let marginaliseIds = op[1];
					for (let id of marginaliseIds) {
						currentFactor = this.marginalize(currentFactor, id);
						// console.log(op);
						// console.log(currentFactor.toStringShort(), currentFactor);
					}
				}
				else {
					console.log('Unrecognised op', op);
				}
			}
			dbg(_=>_('After ops:',currentFactor.toStringShort()));
			
			return currentFactor;
		}
		dbg(_=>_("Merged OPS:", ops.map(op => [op[0],op[1].map(f => f.toStringShort?.() ?? f).join(',')])));

		/// XXX Next steps: Run through the ops (also optimise op order?)
		// debugger;
		let newSumProduct = true;
		if (newSumProduct) {
			let res = runOps(tempOps);
			let res2 = runOps(ops);
			dbg(_=>_("Pre-ops:", ops.map(op => [op[0],op[1].map(f => f.toStringShort?.() ?? f).join(',')])));
			dbg(_=>_("Post-ops:", tempOps.map(op => [op[0],op[1].map(f => f.toStringShort?.() ?? f).join(',')])));
			console.log(ops.length, tempOps.length);
			console.log(res2.toStringShort(),res?.toStringShort?.(),res?.equals?.(res2));
			return res2==null ? [] : [res2];
		}
		else {
			/// XXX Temporary
			let terms = {};
			let termSizes = {};
			for (let potential of potentials) {
				// console.log(potential.toStringShort(),nodeIdSet);
				let toRemoveCurrent = new Set(potential.getDomain()).difference(nodeIdSet);
				// console.log(toRemoveCurrent);
				for (let id of toRemoveCurrent) {
					if (!terms[id]) { terms[id] = 0; termSizes[id] = 1; }
					terms[id]++;
					termSizes[id] *= potential.size();
				}
			}
			// console.log('term sizes:', termSizes);
			
			/// Remove variables that appear in the least number of terms first
			/// (Memory usage optimisation)
			/// XXX-todo: Take into account potential sizes
			let toRemove = Object.entries(termSizes).sort((a,b) => a[1] - b[1]);
			//let toRemove = Object.entries(terms);
			toRemove = toRemove.map(t=>t[0]);
			
			/// Copy
			potentials = [...potentials];		
			for (let i=0; i<toRemove.length; i++) {
				let id = toRemove[i];
				let newPotential = null;
				/// Find all matching potentials and remove potentials from list
				if (terms[id] == 1) {
					for (let j=0; j<potentials.length; j++) {
						if (potentials[j].getDomain().includes(id)) {
							newPotential = potentials[j];
							potentials[j] = null;
							break;
						}
					}
					// console.log('no multiply:', newPotential ? newPotential.toStringShort() : '<none>');
					potentials = potentials.filter(v => v!==null);
				}
				else {
					let toMultiply = [];
					for (let j=0; j<potentials.length; j++) {
						if (potentials[j].getDomain().includes(id)) {
							toMultiply.push(potentials[j]);
							potentials[j] = null;
						}
					}
					potentials = potentials.filter(v => v!==null);
					// let allIds = new Set(toMultiply.map(p => p.getDomain()).flat());
					// for (let j=0; j<potentials.length; j++) {
						// for (let otherId of allIds) {
							// if (otherId !== id)  continue;
							// if (potentials[j].getDomain().includes(otherId) && potentials[j].varNumStates.every(v=>v==1)) {
								// toMultiply.push(potentials[j]);
								// potentials[j] = null;
							// }
						// }
					// }
					// potentials = potentials.filter(v => v!==null);
					
					
					/// Multiply
					// console.log('mulfactors:', toMultiply.map(p=>p.factorNum), toMultiply.map(p=>p.getDomain()), toMultiply);
					// console.log('units:', toMultiply.map(p=>p.isUnitPotential()));
					newPotential = this.multiply(toMultiply);
					/*for (let otherId of new Set(toMultiply.map(m=>m.getDomain()).flat())) {
						if (otherId == id)  continue;
						terms[otherId] = terms[otherId] - toMultiply.length + 1;
					}*/
					// console.log("toMultiply:", ...toMultiply.map(f=>f.toStringShort()));
					// console.log("newPotential:", newPotential.toStringShort());
					// if (newPotential.size()>=248832)  debugger;
					// console.log('res:',newPotential);
				}
				
				/// Marginalize
				// console.log('before marg:', newPotential, id);
				newPotential = this.marginalize(newPotential, id);
				// console.log("marginalized to:", newPotential.toStringShort());
				// console.log('post marg size:', newPotential.size());
				// console.log('after marg:', newPotential);

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
			// console.log('returned potentials:', potentials);
		
		return potentials;
		}
	}
	
	reducePotentials = this.reducePotentials2;
	
	propagate(evidence = {}) {
		// this.mulCache = new Map();
		// this.margCache = new Map();
		
		if (this.options.dbg)  dbg.on; else dbg.off;
		
		let currentFactor = Factor.factors.length;
		
		/// Go through and erase all potentials first
		for (let clique of this.cliques) {
			clique.potentials.length = 0;
			clique.separator.potentialsUp.length = 0;
			clique.separator.potentialsDown.length = 0;
		}
		
		/// Create potentials from each node's CPT, as well as the
		/// the evidence
		if (this._updateFactors || !this.options.crossEvidenceCaching) {
			this.potentials = [...this.originalBn.nodes.map(n => Factor.fromDef(n.def))];
			this._updateFactors = false;
		}
		let potentials = this.potentials.slice();
		
		/// Create unit potentials for every node, in case we need them:
		this.unitPotentials = {};
		this.bn.nodes.forEach(node => {
			let f = new Factor();
			let numStates = this.bn.nodesById[node.id].states.length;
			let values = new Float32Array(numStates);
			values.fill(1);
			f.make([node.id], [numStates], values);
			this.unitPotentials[node.id] = f;
		});
		
		potentials = this.addEvidence(evidence, potentials);
		
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
		
		console.log('ATTACHED TO CLIQUES');
		for (let clique of this.cliques) {
			console.log('Clique:', clique.getString());
			console.log('Clique potentials:', clique.potentials.map(p => p.toStringNodes()).join(' '));
			console.log('Sepset up potentials:', clique.separator.potentialsUp.map(p => p.toStringNodes()).join(' '));
			console.log('Sepset down potentials:', clique.separator.potentialsDown.map(p => p.toStringNodes()).join(' '));
		}
		/*//debugger;
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
		console.log('POPULATE JTREE FROM LEAVES -> ROOT');
		if (1) for (let clique of reverseSortedCliques) {
			let totalPotentials = [...clique.potentials];
			for (let childClique of clique.children) {
				totalPotentials.push(...childClique.separator.potentialsUp);
			}
			//console.log('reducing...', totalPotentials.map(p => p.vars ? p.vars.join(',') : '['+p.id+']'));
			//console.log('to...', clique.separator.getDomain());
			/// XXX - Check this doesn't cause a problem. This should only be for root cliques/null parents
			if (clique.separator.getDomain().length!=0) {
				let sepPotentials = this.reducePotentials(totalPotentials, clique.separator.getDomain());
				clique.separator.potentialsUp.push(...sepPotentials);
			}
		}
		for (let clique of this.cliques) {
			console.log('Clique:', clique.getString());
			console.log('Clique potentials:', clique.potentials.map(p => p.toStringNodes()).join(' '));
			console.log('Sepset up potentials:', clique.separator.potentialsUp.map(p => p.toStringNodes()).join(' '));
			console.log('Sepset down potentials:', clique.separator.potentialsDown.map(p => p.toStringNodes()).join(' '));
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
		console.log('POPULATING JTREE FROM ROOT -> LEAVES');
		if (1) for (let clique of sortedCliques) {
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
		for (let clique of this.cliques) {
			console.log('Clique:', clique.getString());
			console.log('Clique potentials:', clique.potentials.map(p => p.toStringNodes()).join(' '));
			console.log('Sepset up potentials:', clique.separator.potentialsUp.map(p => p.toStringNodes()).join(' '));
			console.log('Sepset down potentials:', clique.separator.potentialsDown.map(p => p.toStringNodes()).join(' '));
		}

		//ounters.log('after down');
		/// -> We now have a full junction tree!
		
		/// For every node:
			/// Select a clique that contains the node
			/// Reduce to just the node
			/// Normalize?
			/// Store the beliefs
		console.log('REDUCE TO OBTAIN BELIEFS')
		let nodeBeliefs = {};
		let finalFactors = [];
		if (1) for (let node of this.originalBn.nodes) {
			//console.log("node.id", node.id, sortedCliques);
			/// Find a clique with the node (replace with something better)
			let minSize = Infinity;
			let chosenClique = null;
			for (let clique of sortedCliques) {
				let cliqueSize = clique.getFullSize();
				if (clique.getDomain().includes(node.id) && cliqueSize < minSize) {
					minSize = cliqueSize;
					chosenClique = clique;
				}
			}
			console.log(node.id, ' to clique ', chosenClique.cliqueNum);
			/*for (let clique of sortedCliques) {
				//console.log(node.id, clique.getDomain().join(','));
				if (clique.getDomain().includes(node.id)) {*/
					//console.log('Found a clique!', node.id, clique.getDomain());
					/// Collect all relevant potentials, multiply them, and marginalize down
					{
						let clique = chosenClique;
						let totalPotentials = [...clique.potentials, ...clique.separator.potentialsDown];
						for (let childClique of clique.children) {
							totalPotentials.push(...childClique.separator.potentialsUp);
						}
						//onsole.log(clique.potentials, clique.separator.potentialsDown, totalPotentials);
						let idPotential = this.reducePotentials(totalPotentials, [node.id]);
						console.log('After last reduce:', idPotential.map(p=>p.toStringShort()).join(' '));
						/// May still have multiple potentials, so multiply if so
						if (idPotential.length>1)  idPotential = this.multiply(idPotential);
						else  idPotential = idPotential[0];
						console.log('Before normalization:', idPotential.toStringShort());
						finalFactors.push(idPotential);
						// console.log('idPotential2:', idPotential);
						/// Convert to factor, which should have been done right at the beginning!
						// idPotential = idPotential.def ? Factor.fromDef(idPotential.def) : idPotential;
						let beliefs = null;
						if (idPotential.activeStates[0]!=null) {
							beliefs = new Array(this.bn.nodesById[idPotential.vars[0]].states.length );
							idPotential.activeStates.forEach(s => beliefs[s] = 1);
							beliefs = normalize(beliefs);
						}
						else {
							beliefs = normalize(idPotential.values);
						}
						// console.log('beliefs:', node.id, beliefs);
						nodeBeliefs[node.id] = beliefs;
					}
					/*break;
				}
			}*/
		}
		dbg(_=>{
			let unusedFactors = Factor.factors.slice(currentFactor).filter(f => !f.temp && !f.findDescendants().some(d => finalFactors.includes(d)));
			let producedUnusedFactors = Factor.factors.slice(currentFactor).filter(f => !f.temp && f.findDescendants().some(d => unusedFactors.includes(d))).filter(f=>!unusedFactors.includes(f));
			let producedPlusUnused = producedUnusedFactors.map(f => [f.factorNum, [...new Set(f.findDescendants()).intersection(unusedFactors)].map(f=>f.factorNum).join(',')]);
			console.log('Unused factors:', unusedFactors);
			console.log('Which produced plus their unused:', producedPlusUnused);
		});
		
		dbg(_=>_(this.jtreeInfo()));
		
		dbg(c=>c(this.getCliqueGraphString({highlightPotentials:true})));
		
		// counters.log('end');
		// console.log('nodeBeliefs:',nodeBeliefs);
		
		/// Done!
		return nodeBeliefs;
	}
	
	jtreeInfo() {
		let str = `
			Num cliques: ${this.cliques.length}
			Cliques:
			${this.cliques.map((c,i) => `#${i}:\t${String(c.getDomain().reduce((a,v)=>a*this.bn.nodesById[v].states.length,1)).padStart(15)}\t${String(c.potentials.reduce((a,v)=>a+v.values.length,0)).padStart(15)}\t${c.getDomain()}`).join('\n')}
		`.replace(/\n\s*/g, '\n');
		return str;
	}
	
	addEvidence(evidence, potentials) {
		let newPotentials = potentials.slice();
		for (let [nodeId,state] of Object.entries(evidence)) {
			if (state >= 0) {
				// debugger;
				let node = this.bn.nodesById[nodeId];
				let f = null;
				if (this.options.crossEvidenceCaching) {
					this.evCache??=new Map();
					if (!this.evCache.has(nodeId)) this.evCache.set(nodeId, new Map());
					if (this.evCache.get(nodeId).has(state)) {
						f = this.evCache.get(nodeId).get(state);
					}
				}
				if (!f) {
					f = new Factor();
					// let values = new Float32Array(node.states.length);
					// values[state] = 1;
					// f.make([node.id], [values.length], values);
					let values = new Float32Array(1);
					values[0] = 1;
					f.make([node.id], [values.length], values, null, [[state]]);
					if (this.options.crossEvidenceCaching)  this.evCache.get(nodeId).set(state, f);
					
				}
				for (let clique of this.cliques) {
					if (clique.getDomain().includes(node.id)) {
						clique.potentials.push(f);
						break;
					}
				}
				newPotentials.push(f);
				/*for (let [i,p] of newPotentials.entries()) {
					if (p.getDomain().includes(node.id)) {
						let newPotential = this.multiply([p,f]); //p.select({[nodeId]: state});
						dbg(_=>{
							f.childFactors.push(newPotential);
							p.childFactors.push(newPotential);
							console.log(newPotential);
						});
						newPotentials[i] = newPotential;
						break;
					}
				}*/
			}
		}
		return newPotentials;
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
	counters.reset();
	//onsole.log(junctionTree);
	// Worker has been sent the BN
	if (e.data[0]==0) {
		var opts = e.data[2] ?? {};
		console.log('COMPILING');
		junctionTree = new JunctionTree(makeBnForUpdates(e.data[1]));
		junctionTree.options = opts;
		junctionTree.compile();
		junctionTree._updateFactors = true;
		postMessage([0,'OK']);
	}
	//Worker has been sent the evidence (for belief update)
	else if (e.data[0]==1) {
		var opts = e.data[2] ?? {};
		junctionTree.options = opts;
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
		postMessage([1,allBeliefs]);
		counters.log();
		counters.reset();
	}
	else if (e.data[0]==2) {
		postMessage([2,junctionTree.getCliqueGraphString({highlightPotentials:true})]);
	}
	//onsole.log(junctionTree);
}

if (typeof(exports)!='undefined') {
	Object.assign(exports, {JunctionTree});
}