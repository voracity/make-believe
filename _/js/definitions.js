var CASE_STATE = 0;
var CASE_REAL_VALUE = 1;
var CASE_INTERVAL = 2;

if (typeof(require)!='undefined'){
	({counters} = require('./utils.js'));
}

var Sampling = class {
	constructor(o = {}) {
		this.evidence = null;
		this.weight = 1;
		this.case = null;
		this.caseReal = null;
		this.caseTypes = null;
		this.intervene = {};
		
		Object.assign(this, o);
	}
}

/// Try to avoid putting anything in the base class.
/// I'm not especially happy that I have a base class.
var Definition = class {
	set needsCompile(_needsCompile) {
		/// Enforce constraint that whenever a node needs compiling, so
		/// too does the net
		this._needsCompile = _needsCompile;
		//onsole.log(this.node, this.node && this.node.net);
		if (this.node && this.node.net)  this.node.net.needsCompile = true;
	}
	get needsCompile() { return this._needsCompile; }
	
	/// Required. Every definition must be able to perform sampling,
	/// as well as produce a Factor version of itself (for junction tree inference).
	sample(sampling) { }
	toFactor() { return new Factor().make(['None'], [2], [1,1]); }
	
	/// Optional. These are to aid with translating between different definition types (CPT
	/// is better than factor, because it's in an input -> output form)
	getCptVersion() { return null; }
	getEquationVersion() { return null; }
	getPreferredStateSpaces() { return null; }
}

var CPT = class extends Definition {
	constructor(nodeOrDef, cpt) {
		super();
		let node = nodeOrDef ? (nodeOrDef.node || nodeOrDef) : null;
		let def = nodeOrDef && nodeOrDef.fromDef ? nodeOrDef : null;

		this.type = "CPT";
		this.node = node;
		this.cpt = cpt;
		this.needsCompile = true;
		if (def)  this.fromDef(def);
		else if (this.node && !this.cpt)  this.setInitial();
	}
	
	duplicate(o) {
		return Object.assign(new CPT(), this, {
			cpt: this.cpt ? this.cpt.slice() : this.cpt,
		}, o);
	}
	
	fromDef(def) {
		this.node = def.node;
		if (def.type == 'CPT') {
			this.cpt = def.cpt.slice();
		}
		else if (def.type == 'CDT') {
			this.cpt = new Float32Array(new ArrayBuffer(this.node.numParentCombinations()*this.node.states.length*4));
			for (var i=0; i<def.funcTable.length; i++) {
				this.cpt[this.node.states.length*i + def.funcTable[i]] = 1;
			}
		}
		else if (def.type == 'Equation') {
			this.setInitial();
		}
	}
	
	toFactor() {
		/// Lots of assumptions being made here (around CPTs)
		let factor = new Factor();
		
		let vars = [];
		let varNumStates = [];
		/// Push parents
		for (let parent of this.node.parents) {
			vars.push(parent.id);
			varNumStates.push(parent.states.length);
		}
		/// Push me
		vars.push(this.node.id);
		varNumStates.push(this.node.states.length);
		
		/// Make factor
		factor.make(vars, varNumStates, this.node.intervene ? this._makeUniform(this.cpt) : this.cpt);
		factor.keyNode = this.node.id;
		
		return factor;
	}
	
	compile(o = {}) {
		o.force = o.force || false;
		//var node = this.node;
		if (o.force || this.needsCompile) {
			if (this.cpt && this.cpt.length) {
				var cptBuf = new ArrayBuffer(this.cpt.length*4);
				var newCpt = new Float32Array(cptBuf);
				for (var i=0; i<this.cpt.length; i++) {
					newCpt[i] = this.cpt[i];
				}
				this.cpt = newCpt;
				this.needsCompile = false;
			}
			else {
				this.setInitial();
			}
		}
		
		return this;
	}
	
	sample(sampling) {
		var node = this.node;
		var cas = sampling.case;
		var caseReal = sampling.caseReal;
		var evidence = sampling.evidence;

		var cpt = this.cpt;
		if (node.intervene) {
			if (!sampling.intervene[node.id]) {
				sampling.intervene[node.id] = this._makeUniform(this.cpt);
			}
			cpt = sampling.intervene[node.id];
		}
		

		var parents = node.parents;
		var rowI = 0;
		var multiplier = 1;
		for (var pi=parents.length-1; pi>=0; pi--) {
			rowI += multiplier*cas[parents[pi].intId];
			multiplier *= parents[pi].states.length;
		}

		if (evidence[node.intId] != -1) {
			/// Force evidence
			cas[node.intId] = evidence[node.intId];
			caseReal[node.intId] = node.states[evidence[node.intId]].value;

			/// Calculate likelihood of evidence
			var likelihood = cpt[rowI*node.states.length + cas[node.intId]];
			sampling.weight *= Math.max(likelihood,0.000001);
		}
		else {
			/// Generate state for node
			var stateProbs = cpt;

			var currentSum = 0;
			var rowStart = rowI*node.states.length;
			var rowEnd = (rowI+1)*node.states.length-1;
			//onsole.debug("rowStart/End", parents, rowI, rowStart, rowEnd, Array.apply([], this.cpt).slice(rowStart,rowEnd+1));
			var r = Math.random();
			for (var i=rowStart; i<=rowEnd; i++) {
				var stateProb = stateProbs[i];
				currentSum += stateProb;
				//onsole.debug(r, currentSum);
				if (r < currentSum) {
					cas[node.intId] = (i-rowStart);
					caseReal[node.intId] = node.states[cas[node.intId]].value;
					break;
				}
			}
		}
	}
	
	getCptVersion() {
		return this.duplicate();
	}
	
	setInitial() {
		this.setUniform();
		return this;
	}
	
	_makeUniform(cpt) {
		let newCpt = new Float32Array(new ArrayBuffer(cpt.length*4));
		for (var i=0; i<newCpt.length; i++)  newCpt[i] = 1/this.node.states.length;
		return newCpt;
	}
	
	setUniform() {
		this.cpt = new Float32Array(new ArrayBuffer(this.node.numParentCombinations()*this.node.states.length*4));
		for (var i=0; i<this.cpt.length; i++)  this.cpt[i] = 1/this.node.states.length;
		// this.cpt = this._makeUniform(this.cpt);

		this.needsCompile = true;

		return this;
	}
	
	/// Need to avoid clashes with property names
	/// Now need to update to new naming scheme setCpt1d/cpt1d
	set1d(newCpt) {
		if (typeof(newCpt)=="undefined") {
			return this.cpt;
		}
		else {
			/// XXX Need to add lots of validation, fixes and the like
			/// here
			for (var i=0; i<newCpt.length; i++) {
				/// Since cpt is a float32 array, this will auto-convert strings
				this.cpt[i] = newCpt[i];
			}
			this.needsCompile = true;
		}
		
		return this;
	}
	
	set(newCpt) { return this.set1d(newCpt); }
	
	randomize() {
		for (var i=0; i<this.cpt.length; i++) {
			this.cpt[i] = Math.random();
		}
		this.normalize();
		
		return this;
	}
	
	normalize(sigFigs = null) {
		for (var i=0; i<this.cpt.length; i+=this.node.states.length) {
			let sum = 0;
			for (var j=0; j<this.node.states.length; j++) {
				sum += this.cpt[i + j]>=0 ? this.cpt[i + j] : 0;
			}
			if (sum==0) {
				for (var j=0; j<this.node.states.length; j++) {
					this.cpt[i + j] = 1/this.node.states.length;
				}
			}
			else {
				for (var j=0; j<this.node.states.length; j++) {
					this.cpt[i + j] /= sum;
				}
			}
			if (sigFigs) {
				let sum = 0;
				let maxJ = 0;
				let max = 0;
				for (var j=0; j<this.node.states.length; j++) {
					if (this.cpt[i + j] > max) {
						max = this.cpt[i + j];
						maxJ = j;
					}
					this.cpt[i + j] = sigFig(this.cpt[i + j], sigFigs);
					sum += this.cpt[i + j];
				}
				/// Apply the leftover to the largest prob
				let remainder = 1 - sum;
				this.cpt[i + maxJ] += remainder;
			}
		}
		
		return this;
	}
	
	getNumRows() {
		return this.cpt.length/this.node.states.length;
	}
	
	/**
	The main functions here are:
	getRow(i)
	getLookupRow(parentStates) //parentStates are numeric
	getNamedLookupRow(parentStates) //parentStates are strings
	
	This gets the i'th row in the CPT, if this node
	has one of those. If i is an array, gets row for all i's in the array.
	These functions return null if no valid row.
	*/
	getRow(i) {
		/// If array, return array
		if (i.length && i.map)  return i.map(v=>this.getRow(v));
		if (i<0 || i>this.cpt.length/this.node.states.length)  return null;
		return Array.prototype.slice.call(this.cpt, i*this.node.states.length, i*this.node.states.length+this.node.states.length);
	}
	
	getLookupRowI(parentStates) {
		var rowI = 0;
		var multiplier = 1;
		var parentState = -1;
		for (var pi=this.node.parents.length-1; pi>=0; pi--) {
			parentState = parentStates[pi];
			if (typeof(parentState)=="string")  parentState = this.node.parents[pi].statesById[parentState].index;
			rowI += multiplier*parentState;
			multiplier *= this.node.parents[pi].states.length;
		}
		return rowI;
	}
	
	getLookupRow(parentStates) { return this.getRow(this.getLookupRowI(parentStates)); }
	
	getNamedLookupRowI(parentStates) {
		/// If not all parents specified, we need to retrieve *multiple*
		/// row indexes
		//onsole.log('xx', Object.keys(parentStates).length);
		if (Object.keys(parentStates).length < this.node.parents.length) {
			/// Get missing parents
			var missingParents = [];
			for (var parent of this.node.parents) {
				if (!parentStates[parent.id]) {
					missingParents.push(parent);
				}
			}

			/// Duplicate parentStates
			var tempParentStates = {};
			for (var i in parentStates)  tempParentStates[i] = parentStates[i];

			/// Iterate through all missingParent state combinations, and retrieve associated rows
			var missParIndexes = setupIndexes(missingParents);
			var matchingRowIs = [];
			do {
				for (var i=0; i<missingParents.length; i++) {
					tempParentStates[missingParents[i].id] = missParIndexes[i];
				}
				matchingRowIs.push(this.getNamedLookupRowI(tempParentStates));
			} while (nextCombination(missingParents, missParIndexes));

			return matchingRowIs;
		}

		var parentIndexes = {};
		/// Work out the index and "place value" of every parent for this node
		/// (even for those not in parentStates)
		var curPlaceValue = 1;
		for (var i=this.node.parents.length-1;i>=0; i--) {
			parentIndexes[this.node.parents[i].id] = {index: i, placeValue: curPlaceValue, parent: this.node.parents[i]};
			curPlaceValue *= this.node.parents[i].states.length;
		}
		//onsole.log(parentIndexes);

		var rowI = 0;
		for (var parentId in parentStates) {
			var stateIndex = parentStates[parentId];
			if (typeof(stateIndex)=="string") {
				/// Silently skip unrecognised parents (this allows mappings
				/// between a pre-updated and post-updated node)
				if (typeof(parentIndexes[parentId])=="undefined")  continue;

				var state = parentIndexes[parentId].parent.statesById[parentStates[parentId]];
				if (typeof(state)=="undefined")  return -1;
				stateIndex = state.index;
			}
			rowI += parentIndexes[parentId].placeValue * stateIndex;
			//onsole.log(rowI);
		}
		return rowI;
	}
	
	getNamedLookupRow(parentStates) { return this.getRow(this.getNamedLookupRowI(parentStates)); }
	
	/**
	This sets the i'th row of the CPT.
	*/
	setRow(i, row) {
		for (var j=0; j<this.node.states.length; j++) {
			this.cpt[i*this.node.states.length + j] = row[j];
		}

		return this;
	}
	
	/**
	Set the CPT row, using the parent state combination in parentStates.
	parentStates here is an array of state indexes, in the same order as this.parents.
	*/
	setLookupRow(parentStates, row) {
		var rowI = this.getLookupRowI(parentStates);
		this.setRow(rowI, row);

		return this;
	}
	
	/**
	Set the CPT row, using the parent state combination in parentStates.
	parentStates is an object that has the form {parent1name: parent1state, parent2name: parent2state, ...}
	*/
	setNamedLookupRow(parentStates, row) {
		var rowI = this.getNamedLookupRowI(parentStates);
		/// Since we're chaining, best to fail silently
		if (rowI == -1)  return this;

		this.setRow(rowI, row);

		return this;
	}
	
	/** XXX insertPoint to be replaced with something that can do more than one at at time
		Inserts, removals and moves must be done separately currently.
	**/
	updateStates({oldNumStates, newNumStates, insertPoint, removedI, fromStateI, toStateI}) {
		/// XXX Need to integrate insertions and removals properly
		if (insertPoint!=undefined) {
			var rows = this.cpt.length/oldNumStates;
			var newCpt = new Float32Array(new ArrayBuffer(rows*newNumStates*4));
			var newStates = newNumStates-oldNumStates;
			for (var r=0; r<rows; r++) {
				for (var i=0; i<insertPoint; i++) {
					newCpt[r*newNumStates + i] = this.cpt[r*oldNumStates + i];
				}
				/*
				Float arrays are 0 initialised by default
				for (var i=oldNumStates; i<newNumStates; i++) {
					newCpt[r*newNumStates + i] = 0;
				}*/
				for (var i=insertPoint+newStates; i<newNumStates; i++) {
					newCpt[r*newNumStates + i] = this.cpt[r*oldNumStates + (i-newStates)];
				}
			}
			this.cpt = newCpt;
		}
		else if (removedI!=undefined) {
			/// Sort in ascending order (to pull later elements in CPT forward)
			removedI = removedI.slice().sort((a,b)=>a-b);
			var rows = this.cpt.length/oldNumStates;
			var newCpt = new Float32Array(new ArrayBuffer(rows*newNumStates*4));
			var adjust = 0;
			for (var r=0; r<rows; r++) {
				for (var i=0; i<newNumStates; i++) {
					while ((i+adjust)===removedI[adjust]) {
						adjust++;
					}
					newCpt[r*newNumStates + i] = this.cpt[r*oldNumStates + (i + adjust)];
				}
			}
			this.cpt = newCpt;
		}
		else if (fromStateI!=undefined && toStateI!=undefined) {
			var dir = fromStateI < toStateI ? 1 : -1;
			var rows = this.cpt.length/this.node.states.length;
			for (var r=0; r<rows; r++) {
				var savedFrom = this.cpt[r*this.node.states.length + fromStateI];
				for (var i=fromStateI; i!=toStateI; i+=dir) {
					this.cpt[r*this.node.states.length + i] = this.cpt[r*this.node.states.length + i + dir];
				}
				this.cpt[r*this.node.states.length + toStateI] = savedFrom;
			}
		}
	}
	
	updateChild({oldChild}, o = {marginal: null}) {
		var child = this.node;
		var oldNode = oldChild;
		console.log('UPDATECHILD');

		/// Start the CPT from (an appropriate) scratch
		this.setInitial();
		/// Iterate through old parent states
		var parentIndexes = setupIndexes(this.node.parents);
		do {
			/// Create a map of parent state names to indexes (which will be used to get/set CPT rows
			/// instead of the indexes themselves)
			var curParentStates = {};
			for (var i=0; i<this.node.parents.length; i++) {
				curParentStates[this.node.parents[i].id] = this.node.parents[i].states[parentIndexes[i]].id;
			}
			/// Get cpt row from old child
			var row = oldNode.def.getNamedLookupRow(curParentStates);
			if (row !== null) {
				//onsole.log("row:", row);
				/// If array of arrays, either do marginal (if requested), or just average
				if (row[0].length) {
					let rows = row;
					if (o.marginal) {
						/// Take marginal
						rows = rows.map((row,rowI) => row.map(v => v*o.marginal[rowI]));
						row = rows.reduce((a,b) => a.map((_,i) => a[i]+b[i]));
					}
					else {
						/// Take average
						/// (This is short, but illegible. I'll allow it.)
						row = rows.reduce((a,b) => a.map((_,i) => a[i]+b[i])).map(a=>a/rows.length);
					}
				}
				/// Set cpt row in new child (if invalid states, will fail silently)
				//onsole.log("setting:", curParentStates, row);
				this.setNamedLookupRow(curParentStates, row);
			}
			else {
				this.setNamedLookupRow(curParentStates,
					new Array(this.node.states.length).fill(1/this.node.states.length)
				);
			}
		} while (nextCombination(this.node.parents, parentIndexes));
	}
	
	/// For .mb file format saving, predominantly
	getContent() {
		return [...this.cpt];
	}

	static test() {
		var node = {
			parents: [{states: ['h','m','l'], intId: 0}, {states: ['t','f'], intId: 1}],
			states: ['y','n'],
			intId: 2,
		};
		var cpt = new CPT(node, [
			0.8, 0.2,
			0.7, 0.3,
			0.6, 0.4,
			0.5, 0.5,
			0.4, 0.6,
			0.3, 0.7,
		]);
		
		cpt.compile();
		
		var numNodes = 3;
		var sampling = new Sampling();
		sampling.case = new Int32Array(new ArrayBuffer(4*numNodes));
		sampling.case[0] = 2;
		sampling.evidence = new Int32Array(new ArrayBuffer(4*numNodes)).fill(-1);
		console.log(cpt.sample(sampling));
		console.log(sampling.case);
		
		return cpt;
	}
}

var CDT = class extends Definition {
	constructor(nodeOrDef, funcTable) {
		super();
		let node = nodeOrDef ? (nodeOrDef.node || nodeOrDef) : null;
		let def = nodeOrDef && nodeOrDef.fromDef ? nodeOrDef : null;
		
		this.type = "CDT";
		this.node = node;
		this.funcTable = funcTable;
		this.needsCompile = true;
		if (def)  this.fromDef(def);
		else if (this.node && !this.funcTable)  this.setInitial();
	}
	
	duplicate(o) {
		return Object.assign(new CDT(), this, {
			funcTable: this.funcTable ? this.funcTable.slice() : this.funcTable,
		}, o);
	}
	
	set(funcTable) {
		this.funcTable = funcTable;
		
		this.needsCompile = true;
		
		return this;
	}
	
	fromDef(def) {
		this.node = def.node;
		this.funcTable = new Int32Array(new ArrayBuffer(this.node.numParentCombinations()*4));
		if (def.type == 'CPT') {
			var numRows = def.cpt.length / def.node.states.length;
			for (var i=0; i<numRows; i++) {
				var maxProb = -1;
				var maxProbJ = -1;
				for (var j=0; j<def.node.states.length; j++) {
					var prob = def.cpt[def.node.states.length*i + j];
					if (prob > maxProb) {
						maxProb = prob;
						maxProbJ = j;
					}
				}
				this.funcTable[i] = maxProbJ;
			}
		}
		else if (def.type == 'Equation') {
			this.setInitial();
		}
	}
	
	toFactor() {
		/// Lots of assumptions being made here (around CPTs)
		let factor = new Factor();
		
		let vars = [];
		let varNumStates = [];
		/// Push parents
		for (let parent of this.node.parents) {
			vars.push(parent.id);
			varNumStates.push(parent.states.length);
		}
		/// Push me
		vars.push(this.node.id);
		varNumStates.push(this.node.states.length);
		
		/// Reconstruct prob values
		//let values = new Float32Array(new ArrayBuffer(this.node.numParentCombinations()*this.node.states.length*4));
		let values = [];
		for (let i=0; i<this.funcTable.length; i++) {
			let arr = new Float32Array(new ArrayBuffer(this.node.states.length*4));
			arr[this.funcTable[i]] = 1;
			values.push(...arr);
		}
		
		/// Make factor
		factor.make(vars, varNumStates, values);
		
		/// XXX: Reduce 0s should eventually work, but not sure if it does right now
		/// If it does, better would be to just create factor without the 0s in the first place
		
		return factor;
	}
	
	compile(o = {}) {
		o.force = o.force || false;
		var node = this;
		if (o.force || this.needsCompile) {
			if (this.funcTable && this.funcTable.length) {
				var ftBuf = new ArrayBuffer(this.funcTable.length*4);
				var newFt = new Int32Array(ftBuf);
				for (var i=0; i<this.funcTable.length; i++) {
					newFt[i] = this.funcTable[i];
				}
				this.funcTable = newFt;
				this.needsCompile = false;
			}
			else {
				this.setInitial();
			}
		}
		return this;
	}
	
	sample(sampling) {
		var node = this.node;
		var cas = sampling.case;
		var evidence = sampling.evidence;

		var parents = node.parents;
		var rowI = 0;
		var multiplier = 1;
		for (var pi=parents.length-1; pi>=0; pi--) {
			rowI += multiplier*cas[parents[pi].intId];
			multiplier *= parents[pi].states.length;
		}
		
		if (evidence[node.intId] != -1) {
			/// Force evidence
			cas[node.intId] = evidence[node.intId];

			/// Calculate likelihood of evidence (which is either 0 or 1)
			sampling.weight *= (this.funcTable[rowI] == cas[node.intId] ? 1 : 0.000001);
		}
		else {
			/// Get the deterministic state
			cas[node.intId] = this.funcTable[rowI];
		}
	}
	
	getCptVersion() {
		let cpt = new Float32Array(new ArrayBuffer(this.node.numParentCombinations()*this.node.states.length*4));
		for (let i=0; i<this.funcTable.length; i++) {
			cpt[this.node.states.length*i + this.funcTable[i]] = 1;
		}
		
		return new CPT(this.node, cpt);
	}
	
	setInitial() {
		this.funcTable = new Int32Array(new ArrayBuffer(this.node.numParentCombinations()*4));
		this.needsCompile = true;
		return this;
	}

	getNumRows() {
		return this.funcTable.length;
	}
	
	/**
	This gets the i'th row (or distribution) in the CDT, as a full distribution.
	If i is an array, gets row for all i's in the array.
	These functions return null if no valid row.
	*/
	getRow(i, o = {}) {
		/// If array, return array
		if (i.length && i.map)  return i.map(v=>this.getRow(v));
		if (i<0 || i>this.funcTable.length)  return null;
		let probs = new Float32Array(this.node.states.length);
		probs[this.funcTable[i]] = 1;
		return probs;
	}

	/**
	This sets the i'th row (which is just a single value) of the function table.
	*/
	setRow(i, row) {
		this.funcTable[i] = row;

		return this;
	}
	
	getNamedFuncTableEntry(parentStates) {
		var rowI = this.getNamedLookupRowI(parentStates);
		if (rowI == -1)  return null;
		/// If rowI is an array, return all the relevant rows
		if (rowI.length)  return rowI.map(i => this.funcTable[i]);
		return this.funcTable[rowI];
	}

	setNamedFuncTableEntry(parentStates, entry) {
		var rowI = this.getNamedLookupRowI(parentStates);

		if (rowI == -1)  return this;

		this.funcTable[rowI] = entry;

		return this;
	}

	updateStates({oldNumStates, newNumStates, insertPoint, insertedI, removedI}) {
		/// Just ensure that there are no invalid states
		for (var i=0; i<this.funcTable.length; i++) {
			if (this.funcTable[i] > newNumStates) {
				/// Set to 0 --- not sure if this is the best state to set it to
				this.funcTable[i] = 0;
			}
		}
		
		return this;
	}
	
	updateChild({oldChild}) {
		var child = this.node;
		var oldNode = oldChild;

		/// Start the CPT from (an appropriate) scratch
		this.setInitial();
		/// Iterate through old parent states
		var parentIndexes = setupIndexes(this.node.parents);
		do {
			/// Create a map of parent state names to indexes (which will be used to get/set CPT rows
			/// instead of the indexes themselves)
			var curParentStates = {};
			for (var i=0; i<this.node.parents.length; i++) {
				curParentStates[this.node.parents[i].id] = this.node.parents[i].states[parentIndexes[i]].id;
			}
			var entry = oldNode.def.getNamedLookupRow(curParentStates);
			if (entry !== null) {
				if (entry.length) {
					var seen = {};
					entry.forEach(a => seen[a] ? seen[a]++ : seen[a]=1);
					console.log(entry, seen);
					/// Get the entry with the highest count
					entry = Object.entries(seen).reduce((a,b) => a[1]>b[1] ? a : b)[0];
				}
				/// If multiple rows (entries), need to pick one (or take majority vote?)
				console.log("funcTable setting:", curParentStates, entry);
				this.setNamedLookupRow(curParentStates, entry);
			}
			else {
				this.setNamedLookupRow(curParentStates, 0);
			}
		} while (nextCombination(this.node.parents, parentIndexes));
		
		return this;
	}
	
	/// For .mb file format saving, predominantly
	getContent() {
		return [...this.funcTable];
	}

	static test() {
		var node = {
			parents: [{states: ['h','m','l'], intId: 0}, {states: ['t','f'], intId: 1}],
			states: ['y','n'],
			intId: 2,
		};
		var cdt = new CDT(node, [
			0,
			1,
			1,
			0,
			0,
			0,
		]);
		
		cdt.compile();
		
		var numNodes = 3;
		var sampling = new Sampling();
		sampling.case = new Int32Array(new ArrayBuffer(4*numNodes));
		sampling.case[0] = 1;
		sampling.evidence = new Int32Array(new ArrayBuffer(4*numNodes)).fill(-1);
		console.log(cdt.sample(sampling));
		console.log(sampling.case);
		
		return cdt;
	}
}
		
/// We're borrowing some functions from CPT
for (var func of `getLookupRowI getNamedLookupRowI setLookupRowI setNamedLookupRowI
		getLookupRow getNamedLookupRow setLookupRow setNamedLookupRow`.split(/\s+/)) {
	CDT.prototype[func] = CPT.prototype[func];		
}


var Equation = class extends Definition {
	constructor(nodeOrDef, funcText) {
		super();
		let node = nodeOrDef ? (nodeOrDef.node || nodeOrDef) : null;
		let def = nodeOrDef && nodeOrDef.fromDef ? nodeOrDef : null;

		this.type = "Equation";
		this.node = node;
		this.funcText = funcText;
		this.funcDef = null;
		this.needsCompile = true;
		if (def)  this.fromDef(def);
		else if (this.node && !this.funcText)  this.setInitial();
	}
	
	fromDef(def) {
		this.node = def.node;
		this.setInitial();
	}
	
	set(funcText) {
		this.funcText = funcText;
		var funcDef = Equation.parse(this.node.id, this.node.parents.map(p=>p.id), funcText);
		this.funcDef = funcDef;
		this.func = null;
		this.needsCompile = true;

		return this;
	}
	
	duplicate(o) {
		/// No need to dup funcText/funcDef, because neither strings
		/// nor functions can be changed in place (in any way that I use here)
		return Object.assign(new Equation(), this, o);
	}
	
	static parse(nodeId, parentIds, equationText) {
		/// Do the minimum conversion needed to get it into JS
		/// XXX-fix: Properly parse the equation!
		/// Note: Parents will always be in the order defined here, so this approach is fine
		var pars = parentIds;
		var bodyDef = equationText.replace(new RegExp('^'+nodeId+'\\s*=\\s*', 'g'), '');
		for (var p=0; p<pars.length; p++) {
			if (pars[p]) {
				//onsole.log(pars, bodyDef);
				bodyDef = bodyDef.replace(new RegExp('\\b'+pars[p]+'\\b', 'g'), '__pars['+p+']');
				//onsole.log(pars, bodyDef);
			}
		}
		return [
			'__pars',
			'return '+bodyDef
		];
	}
	
	getRHS() {
		return this.funcText.replace(new RegExp('^\\s*'+IDREGEX.source+'\\s*=\\s*'), '');
	}
	
	compile(o = {}) {
		o.force = o.force || false;
		if (o.force || this.needsCompile) {
			if (this.funcText && this.funcText.length) {
				this.funcDef = Equation.parse(this.node.id, this.node.parents.map(p=>p.id), this.funcText);
				this.func = new Function(...this.funcDef);
				this.needsCompile = false;
				this.parentStates = new Float32Array(new ArrayBuffer(4*this.node.parents.length));
			}
			else {
				this.setInitial();
			}
		}
		return this;
	}
	
	/// XXX Need to unify the interface to the sample function
	/// (probably want it less ugly than this signature)
	sample(sampling) {
		var node = this.node;
		var evidence = sampling.evidence;
		var cas = sampling.case;
		var caseReal = sampling.caseReal;
		var caseTypes = sampling.caseTypes;

		/// Generate value for node
		var parents = node.parents;
		for (var pi=0; pi<parents.length; pi++) {
			var casType = caseTypes[parents[pi].intId];
			//onsole.log(this.parentStates, cas);			
			if (casType == CASE_REAL_VALUE) {
				//onsole.log("real parent", this.parentStates, cas);
				this.parentStates[pi] = caseReal[parents[pi].intId];
			}
			else if (casType == CASE_INTERVAL) {
				let parentStateI = cas[parents[pi].intId];
				let parentState = parents[pi].states[parentStateI];
				this.parentStates[pi] = Uniform(parentState.minimum, parentState.maximum);
			}
			else {
				//onsole.log('int parent',casType,this.parentStates, cas);
				this.parentStates[pi] = cas[parents[pi].intId];
			}
		}

		if (evidence[node.intId] == -1) {
			/// Save real and integer/discrete version of output
			//onsole.log(this.parentStates, cas);			
			caseReal[node.intId] = this.func(this.parentStates);
			cas[node.intId] = this.getDiscreteBin(caseReal[node.intId]);
		}
		/// Only discrete evidence supported for now!
		else if (evidence[node.intId] != -1) {
			/// Force evidence
			cas[node.intId] = evidence[node.intId];
			
			/// Estimate likelihood of evidence, with a mini-sampling
			//onsole.log(this.parentStates, cas);
			let numSamples = 1000;
			let hits = 0;
			for (let i=0; i<numSamples; i++) {
				if (this.getDiscreteBin(this.func(this.parentStates)) == cas[node.intId]) {
					hits += 1;
				}
			}

			let likelihood = hits/numSamples;
			sampling.weight *= Math.max(likelihood,0.000001);

		}
	}
	
	getDiscreteBin(val) {
		for (let i=0; i<this.node.states.length; i++) {
			let state = this.node.states[i];
			if (state.value !== null) {
				if (val == state.value) {
					return i;
				}
			}
			else if (val < state.maximum) {
				return i;
			}
		}
		return null;
	}
	
	_convertParentStates(parentStates) {
		let vals = new Float32Array(parentStates.length);
		
		for (let i=0; i<parentStates.length; i++) {
			let parentState = this.node.parents[i].states[parentStates[i]];
			if (parentState.minimum !== null) {
				vals[i] = Uniform(parentState.minimum, parentState.maximum);
			}
			else if (parentState.value !== null) {
				vals[i] = parentState.value;
			}
			else {
				vals[i] = parentStates[i];
			}
		}
		
		return vals;
	}

	getCptVersion() {
		let numParentCombinations = this.node.numParentCombinations();
		let numStates = this.node.states.length;
		let estimate = true;
		let samplesPerRow = 1000;
		
		this.compile();
		
		let cpt = new Float32Array(new ArrayBuffer(numParentCombinations*numStates*4));
		if (estimate) {
			let parentStates = setupIndexes(this.node.parents);
			let r = 0;
			do {
				/// Samples per row?
				for (let i=0; i<samplesPerRow; i++) {
					let val = this.func(this._convertParentStates(parentStates));
					let stateBin = this.getDiscreteBin(val);
					/// XXX It should probably go into an 'other' state or something
					if (stateBin !== null) {
						cpt[numStates*r + stateBin] += 1;
					}
				}
				r++;
			} while (nextCombination(this.node.parents, parentStates));
		}
		else {
			for (let r=0; r<numParentCombinations; r++) {
				for (let i=0; i<numStates; i++) {
					cpt[numStates*r + i] = 1;
				}
			}
		}
		
		let cptDef = new CPT(this.node, cpt);
		cptDef.normalize();
		return cptDef;
	}
	
	getEquationVersion() {
		return this.duplicate();
	}
	
	getPreferredStateSpaces() {
		return ['continuous', 'interval'];
	}
	
	toFactor() {
		return this.getCptVersion().toFactor();
	}
	
	setInitial() {
		/// GeNIe does the sum of parents by default. Will leave
		/// it that way for now.
		if (this.node.parents.length) {
			this.funcText = this.node.id+"="+this.node.parents.map(a=>a.id).join("+");
		}
		else {
			this.funcText = this.node.id+"=0";
		}
		this.needsCompile = true;
		return this;
	}
	
	updateStates() {}
	updateChild() {}
	renameNode(oldId, newId) {
		console.log(oldId, newId);
		/// Need to update equation text,
		/// for this node, and all children
		this.funcText = this.funcText.replace(new RegExp(String.raw`^\b(${oldId})\b`, 'g'), '$1'+newId);
		/// Current function doesn't change
		;
		for (var child of this.node.children) {
			if (child.def.type == 'Equation') {
				child.def.funcText = child.def.funcText.replace(new RegExp(String.raw`\b(${oldId})\b`, 'g'), newId);
			}
		}
	}

	static test() {
		var node = {
			parents: [{states: ['h','m','l'], intId: 0, id: 'pollution'}, {states: ['t','f'], intId: 1, id: 'smoker'}],
			states: ['y','n'],
			intId: 2,
			id: 'cancer',
		};
		//var eqn = new Equation(node, node.id +' = Normal(pollution,1) + Normal(smoker, 2)');
		var eqn = new Equation(node, node.id +' = pollution + 2*smoker');
		
		eqn.compile();
		
		var numNodes = 3;
		var sampling = new Sampling();
		sampling.case = new Int32Array(new ArrayBuffer(4*numNodes));
		sampling.case[0] = 1;
		sampling.caseTypes = new Int32Array(new ArrayBuffer(4*numNodes)).fill(CASE_REAL_VALUE);
		sampling.caseReal = new Float32Array(new ArrayBuffer(4*numNodes)).fill(3.2);
		sampling.evidence = new Int32Array(new ArrayBuffer(4*numNodes)).fill(-1);
		console.log(eqn.sample(sampling));
		console.log(sampling.case, sampling.caseReal);
		
		return eqn;
	}
}

function duplicate(obj, props) {
	return Object.assign(Object.create(obj.constructor.prototype), props);
}

var NoisyOrDef = class extends Definition {
	constructor(nodeOrDef, ...args) {
		super();
		let node = nodeOrDef ? (nodeOrDef.node || nodeOrDef) : null;
		let def = nodeOrDef && nodeOrDef.fromDef ? nodeOrDef : null;

		this.type = "NoisyOr";
		this.node = node;
		/// parent, prob, parent, prob
		this.noisyArgs = args;
		/// matchingStates: {thisState, parentStates}
		/// if null, assumes 0 state is matching state everywhere
		this.matchingStates = null;
		this.needsCompile = true;
		if (def)  this.fromDef(def);
		else if (this.node)  this.setInitial();
	}
	
	duplicate(o) {
		return Object.assign(new NoisyOrDef(), this, {
			noisyArgs: this.noisyArgs ? this.noisyArgs.slice() : this.noisyArgs,
			matchingStates: clone(this.matchingStates),
		}, o);
	}
	
	setInitial() {
		/// Equivalent to an OR
		this.noisyArgs = Array.from({length: this.node.parents.length*2 + 1}).fill(1);
		/// No leak probability
		this.noisyArgs[this.noisyArgs.length-1] = 0;
	}
	
	fromDef(def) {
		this.node = def.node;
		this.setInitial();
	}
	
	toFactor() {
		return this.getCptVersion().toFactor();
	}
	
	compile(o = {}) {
		o.force = o.force || false;
		if (o.force || this.needsCompile) {
			if (!this.noisyArgs) {
				this.setInitial();
			}
			if (!this.matchingStates) {
				this.matchingStates = {thisState: 0, parentStates: []};
			}
			if (this.matchingStates.parentStates.length != this.node.parents.length) {
				this.matchingStates.parentStates = Array.from({length: this.node.parents.length}).fill(0);
			}
		}
		
		return this;
	}
	
	sample(sampling) {
		let {caseTypes, case: cas, caseReal, evidence} = sampling;
		let parents = this.node.parents;
		
		for (let i=0; i<parents.length; i++) {
			if (caseTypes[parents[i].intId] == CASE_REAL_VALUE) {
				this.noisyArgs[i*2] = caseReal[parents[i].intId];
			}
			else if (caseTypes[parents[i].intId] == CASE_INTERVAL) {
				/// XXX
			}
			else {
				this.noisyArgs[i*2] = cas[parents[i].intId];
			}
		}
		
		if (evidence[this.node.intId] != -1) {
			sampling.weight *= this.getFirstProb(this.noisyArgs);

			cas[this.node.intId] = evidence[node.intId];
			caseReal[this.node.intId] = this.node.states[cas[this.node.intId]].value;
		}
		else {
			cas[this.node.intId] = NoisyOr(...this.noisyArgs);
			caseReal[this.node.intId] = this.node.states[cas[this.node.intId]].value;
		}
	}
	
	/// Format: parent, prob, parent, prob
	getFirstProb(args) {
		/// Copied from NoisyOr
		let product = 1;
		let parentIsActive = 0;
		for (let i=0; i<args.length-1; i+=2) {
			parentIsActive = this.matchingStates.parentStates[i/2]==args[i];
			product *= (1-parentIsActive*args[i+1]);
		}
		if (args.length % 2 !=0) {
			product *= (1-args[args.length-1]);
		}
		return this.matchingStates.thisState == 0 ? 1-product : product;
	}
	
	getCptVersion() {
		let numParentCombinations = this.node.numParentCombinations();
		let numStates = this.node.states.length;
		let newCpt = new CPT(this.node);
		let parents = this.node.parents;
		
		let cpt = new Float32Array(new ArrayBuffer(numParentCombinations*numStates*4));
		let parentStates = setupIndexes(this.node.parents);
		let r = 0;
		do {
			for (let i=0; i<parents.length; i++) {
				if (['categorical','ordered'].includes(parents[i].stateSpace.type)) {
					this.noisyArgs[i*2] = parentStates[i];
				}
				else if (parents[i].stateSpace.type == 'point') {
					this.noisyArgs[i*2] = parents[i].states[parentStates[i]].value;
				}
				else { /// if interval
					let {minimum, maximum} = parents.states[parentStates[i]];
					/// My interpration: if the state interval does not contain 0, then true, else false
					/// Not sure if the interpretation really makes any sense
					this.noisyArgs[i*2] = minimum > 0 || maximum < 0;
				}
			}
			cpt[numStates*r] = this.getFirstProb(this.noisyArgs);
			cpt[numStates*r + 1] = 1 - cpt[numStates*r];
			r++;
		} while (nextCombination(this.node.parents, parentStates));
		
		newCpt.cpt = cpt;
		
		return newCpt;
	}
}

var WeightedSum = class extends Definition {
	constructor(nodeOrDef, top, bottom, o = {}) {
		super();
		let node = nodeOrDef ? (nodeOrDef.node || nodeOrDef) : null;
		let def = nodeOrDef && nodeOrDef.fromDef ? nodeOrDef : null;

		this.type = "WeightedSum";
		this.node = node;
		/// parent 1 weight, parent 2 weight, ...
		this.top = top;
		this.bottom = bottom;
		this.parentWeights = o.parentWeights;
		/// parent state weights not yet implemented
		this.parentStateWeights = o.parentStateWeights;
		
		this.needsCompile = true;
		
		/// For compiled use
		this.maxParentSum = 0;
		this.topBetaParams = null;
		this.bottomBetaParams = null;
		
		if (def)  this.fromDef(def);
		else if (this.node)  this.setInitial({preserveExisting: true});
	}
	
	duplicate(o) {
		return Object.assign(new NoisyOrDef(), this, {
			top: clone(this.top),
			bottom: clone(this.bottom),
			parentWeights: clone(this.parentWeights),
			parentStateWeights: clone(this.parentStateWeights),
		}, o);
	}
	
	setInitial({preserveExisting} = {preserveExisting: false}) {
		if (!preserveExisting || !this.top)
			{ this.top = Array.from({length: this.node.states.length}).fill(1/this.node.states.length); }
		if (!preserveExisting || !this.bottom)
			{ this.bottom = clone(this.top); }
		if (!preserveExisting || !this.parentWeights)
			/// Equal weights
			{ this.parentWeights = Array.from({length: this.node.parents.length}).fill(1); }
	}
	
	fromDef(def) {
		this.node = def.node;
		this.setInitial();
	}
	
	toFactor() {
		return this.getCptVersion().toFactor();		
	}
	
	compile(o = {}) {
		o.force = o.force || false;
		if (o.force || this.needsCompile) {
			this.setInitial({preserveExisting:true});
			/// For each parent state, work out their contribution given the weights
			this.parentStateContributions = [];
			for (let i=0; i<this.node.parents.length; i++) {
				let states = this.node.parents[i].states;
				/// Values are in reverse order
				let stateValues = states.map((s,i) => s.value !== null ? s.value : (states.length-i));
				this.parentStateContributions.push(new Float32Array(stateValues.length));
				let maxI = Math.max(...stateValues);
				let minI = Math.min(...stateValues);
				for (let j=0; j<stateValues.length; j++) {
					this.parentStateContributions[i][j] =
						(stateValues[j]-minI)/(maxI-minI) * this.parentWeights[i];
				}
			}
			
			this.maxParentSum = this.parentWeights.reduce((a,v) => a+v, 0);
			
			this.topBetaParams = this.fitBetaToMultinomial(this.top);
			this.bottomBetaParams = this.fitBetaToMultinomial(this.bottom);
		}
		
		return this;
	}
	
	sample(sampling) {
		let {caseTypes, case: cas, caseReal, evidence} = sampling;
		let parents = this.node.parents;
		
		let sum = 0;
		for (let i=0; i<parents.length; i++) {
			if (caseTypes[parents[i].intId] == CASE_REAL_VALUE) {
				/// XXX
			}
			else if (caseTypes[parents[i].intId] == CASE_INTERVAL) {
				/// XXX
			}
			else {
				sum += this.parentStateContributions[i][cas[parents[i].intId]];
			}
		}
		
		let interpolation = sum/this.maxParentSum;
		let currentAlpha = (this.topBetaParams[0] - this.bottomBetaParams[0])*interpolation + this.bottomBetaParams[0];
		let currentBeta = (this.topBetaParams[1] - this.bottomBetaParams[1])*interpolation + this.bottomBetaParams[1];
		
		if (evidence[this.node.intId] != -1) {
			let stateBottom = evidence[node.intId]/this.node.states.length;
			let stateTop = (evidence[node.intId]+1)/this.node.states.length;
			let stateProb = 
				this.betaCdf(stateTop, currentAlpha, currentBeta)
				- this.betaCdf(stateBottom, currentAlpha, currentBeta);
			sampling.weight *= stateProb;

			cas[this.node.intId] = evidence[node.intId];
			caseReal[this.node.intId] = this.node.states[cas[this.node.intId]].value;
		}
		else {
			let val = this.generateBetaValue(currentAlpha, currentBeta);
			cas[this.node.intId] = Math.floor(val*this.node.states.length*0.99999);
			caseReal[this.node.intId] = val;
		}
	}
	
	getCptVersion() {
		this.compile();
		
		let numParentCombinations = this.node.numParentCombinations();
		let numStates = this.node.states.length;
		let newCpt = new CPT(this.node);
		let parents = this.node.parents;
		
		let cpt = new Float32Array(new ArrayBuffer(numParentCombinations*numStates*4));
		let parentStates = setupIndexes(this.node.parents);
		let r = 0;
		do {
			let sum = 0;
			for (let i=0; i<parents.length; i++) {
				/*if (caseTypes[parents[i].intId] == CASE_REAL_VALUE) {
					/// XXX
				}
				else if (caseTypes[parents[i].intId] == CASE_INTERVAL) {
					/// XXX
				}
				else {*/
					sum += this.parentStateContributions[i][parentStates[i]];
				//}
			}
			
			let interpolation = sum/this.maxParentSum;
			let currentAlpha = (this.topBetaParams[0] - this.bottomBetaParams[0])*interpolation + this.bottomBetaParams[0];
			let currentBeta = (this.topBetaParams[1] - this.bottomBetaParams[1])*interpolation + this.bottomBetaParams[1];
			
			let rowVector = this.getVectorFromBeta(currentAlpha, currentBeta, numStates);
			
			cpt.set(rowVector, r*numStates);
			
			r++;
		} while (nextCombination(this.node.parents, parentStates));
		
		newCpt.cpt = cpt;
		
		return newCpt;
	}

	fitBetaToMultinomial(vector) {
		var points = [];
		
		for (var i=0; i<vector.length; i++) {
			points.push([(i/vector.length)+(0.5/vector.length), vector[i]]);
		}
		
		/// Calc mean
		var mean = 0;
		for (var i=0; i<points.length; i++) {
			/// Midpoint * prob, giving weighted sum
			mean += points[i][0] * points[i][1];
		}
		
		/// Calc variance
		var variance = 0;
		for (var i=0; i<points.length; i++) {
			/// (Midpoint - mean)^2 * prob, giving weighted squared deviation (variance)
			variance += Math.pow(points[i][0] - mean, 2) * points[i][1];
		}
		
		/// Now estimate alpha/beta from mean/variance
		var complMean = 1-mean;
		var alpha = mean*(mean*complMean/variance - 1);
		var beta = complMean*(mean*complMean/variance - 1);
		
		var ret = this.optimizeBetaFit(alpha, beta, vector);
		alpha = ret[0];
		beta = ret[1];
		
		return [alpha, beta];
	}

	getVectorFromBeta(alpha, beta, length) {
		var prevBetaVal = 0;
		var vec = [];
		for (var i=0; i<length; i++) {
			let betaVal = this.betaCdf(((i+1)/length), alpha, beta);

			let stateProb = betaVal - prevBetaVal;
			
			vec.push(stateProb);
			
			prevBetaVal = betaVal;
		}
		
		return vec;
	}

	genNorm(mean = 0, sd = 1) {
		let n = 20;
		let val = (new Array(n).fill(0).reduce((acc,val)=>acc+Math.random(),0))-(n/2);
		return val*sd + mean;
	}

	optimizeBetaFit(alpha, beta, vector) {
		var maxAlpha = alpha;
		var maxBeta = beta;
		var maxBetaVec = this.getVectorFromBeta(alpha, beta, vector.length);
		var maxKl = this.klDiv(vector, maxBetaVec);
		var numSteps = 1000;
		
		var currAlpha = maxAlpha, currBeta = maxBeta;
		for (var i=0; i<numSteps; i++) {
			currAlpha = maxAlpha + this.genNorm()*0.05;
			currBeta = maxBeta + this.genNorm()*0.05;
			var currBetaVec = this.getVectorFromBeta(currAlpha, currBeta, vector.length);
			var currKl = this.klDiv(vector, currBetaVec);
			if (currKl < maxKl) {
				maxBetaVec = currBetaVec;
				maxKl = currKl;
				maxAlpha = currAlpha;
				maxBeta = currBeta;
			}
		}
		
		return [maxAlpha, maxBeta];
	}

	klDiv(vec, otherVec) {
		let MAX_PENALTY = 10000;
		var sum = 0;
		for (var i=0; i<vec.length; i++) {
			if (otherVec[i]==0 && vec[i]==0)  sum += 0;
			else if (otherVec[i]==0 || vec[i]==0)  sum += MAX_PENALTY;
			else {
				sum += vec[i]*Math.log(vec[i]/otherVec[i]);
			}
		}
		return Math.max(0,sum); /// Can sometimes be negative for very small numbers
	}

	/////////////// Beta distribution code
	// XXX: Copyright status of code not clear. Check or replace.

	LogGamma(Z) {
		var S=1+76.18009173/Z-86.50532033/(Z+1)+24.01409822/(Z+2)-1.231739516/(Z+3)+.00120858003/(Z+4)-.00000536382/(Z+5);
		var LG= (Z-.5)*Math.log(Z+4.5)-(Z+4.5)+Math.log(S*2.50662827465);
		return LG
	}

	Betinc(X,A,B) {
		var A0=0;
		var B0=1;
		var A1=1;
		var B1=1;
		var M9=0;
		var A2=0;
		var C9;
		while (Math.abs((A1-A2)/A1)>.00001) {
			A2=A1;
			C9=-(A+M9)*(A+B+M9)*X/(A+2*M9)/(A+2*M9+1);
			A0=A1+C9*A0;
			B0=B1+C9*B0;
			M9=M9+1;
			C9=M9*(B-M9)*X/(A+2*M9-1)/(A+2*M9);
			A1=A0+C9*A1;
			B1=B0+C9*B1;
			A0=A0/B1;
			B0=B0/B1;
			A1=A1/B1;
			B1=1;
		}
		return A1/A
	}

	betaCdf(Z,A,B) {
		let Betacdf;
		if (A<=0) {
			//alert("alpha must be positive")
			Betacdf = 0;
		} else if (B<=0) {
			//alert("beta must be positive")
			Betacdf = 0;	} else if (Z<=0) {
			Betacdf=0
		} else if (Z>=1) {
			Betacdf=1
		} else {
			let S=A+B;
			let BT=Math.exp(this.LogGamma(S)-this.LogGamma(B)-this.LogGamma(A)+A*Math.log(Z)+B*Math.log(1-Z));
			if (Z<(A+1)/(S+2)) {
				Betacdf=BT*this.Betinc(Z,A,B)
			} else {
				Betacdf=1-BT*this.Betinc(1-Z,B,A)
			}
		}
		Betacdf=Betacdf+.000005
		return Betacdf;
	}

	generateBetaValue(alpha, beta) {
		// javascript shim for Python's built-in 'sum'
		function sum(nums) {
		  var accumulator = 0;
		  for (var i = 0, l = nums.length; i < l; i++)
			accumulator += nums[i];
		  return accumulator;
		}

		// In case you were wondering, the nice functional version is slower.
		// function sum_slow(nums) {
		//   return nums.reduce(function(a, b) { return a + b; }, 0);
		// }
		// var tenmil = _.range(1e7); sum(tenmil); sum_slow(tenmil);

		// like betavariate, but more like R's name
		function rbeta(alpha, beta) {
		  var alpha_gamma = rgamma(alpha, 1);
		  return alpha_gamma / (alpha_gamma + rgamma(beta, 1));
		}

		// From Python source, so I guess it's PSF Licensed
		var SG_MAGICCONST = 1 + Math.log(4.5);
		var LOG4 = Math.log(4.0);

		function rgamma(alpha, beta) {
		  // does not check that alpha > 0 && beta > 0
		  if (alpha > 1) {
			// Uses R.C.H. Cheng, "The generation of Gamma variables with non-integral
			// shape parameters", Applied Statistics, (1977), 26, No. 1, p71-74
			var ainv = Math.sqrt(2.0 * alpha - 1.0);
			var bbb = alpha - LOG4;
			var ccc = alpha + ainv;

			while (true) {
			  var u1 = Math.random();
			  if (!((1e-7 < u1) && (u1 < 0.9999999))) {
				continue;
			  }
			  var u2 = 1.0 - Math.random();
			  var v = Math.log(u1/(1.0-u1))/ainv;
			  var x = alpha*Math.exp(v);
			  var z = u1*u1*u2;
			  var r = bbb+ccc*v-x;
			  if (r + SG_MAGICCONST - 4.5*z >= 0.0 || r >= Math.log(z)) {
				return x * beta;
			  }
			}
		  }
		  else if (alpha == 1.0) {
			var u = Math.random();
			while (u <= 1e-7) {
			  u = Math.random();
			}
			return -Math.log(u) * beta;
		  }
		  else { // 0 < alpha < 1
			// Uses ALGORITHM GS of Statistical Computing - Kennedy & Gentle
			while (true) {
			  var u3 = Math.random();
			  var b = (Math.E + alpha)/Math.E;
			  var p = b*u3;
			  if (p <= 1.0) {
				x = Math.pow(p, (1.0/alpha));
			  }
			  else {
				x = -Math.log((b-p)/alpha);
			  }
			  var u4 = Math.random();
			  if (p > 1.0) {
				if (u4 <= Math.pow(x, (alpha - 1.0))) {
				  break;
				}
			  }
			  else if (u4 <= Math.exp(-x)) {
				break;
			  }
			}
			return x * beta;
		  }
		}
		
		return rbeta(alpha, beta);
	}
}

var Factor = class {
	constructor() {
		counters.newFactor++;
		/// e.g. A, B, C
		this.vars = [];
		/// e.g. 3,6,2 means A has 3 states, B has 6 states, C has 2 states
		this.varNumStates = [];
		/// A (possibly partial) enumeration of the cross product for this factor (all possible var combinations)
		/// e.g.: 0 0 0, 0 0 1, 0 1 0, 0 1 1, 0 2 0, 0 2 1, 0 3 0, etc.
		/// This will be partial if some combinations have been reduced/eliminated
		/// This is stored as a one dimensional array, to reduce memory overhead
		this.indexes = [];
		/// Values associated with the indexes. Of course, it must be that indexes.length/vars.length == values.length
		this.values = [];
		/// Any constants associated with this factor, e.g.: {C: 1}
		this.constants = {};
	}
	
	make(vars, varNumStates, values = null) {
		counters.make++;
		//this.vars = vars.slice();
		//this.varNumStates = new Uint32Array(varNumStates);
		this.vars = vars;
		this.varNumStates = varNumStates;
		
		//this.makeIndexes();
		this._size = 1;
		for (let i=0; i<this.varNumStates.length; i++) {
			this._size *= this.varNumStates[i];
		}
		
		if (values && values.slice) {
			//this.values = values.slice();
			this.values = values;
		}
		else {
			let numIndexes = this._size * this.vars.length;
			this.values = new Float32Array(this._size);
			if (typeof(values)=="function") {
				this.values = this.values.map(values);
			}
		}
		
		return this;
	}
	
	makeIndexes() {
		let numIndexes = this.varNumStates.reduce((a,v) => a*v, 1) * this.vars.length;
		/*
		/// Copy using 'copyWithin'
		let buf = new Uint32Array(new ArrayBuffer(numIndexes*4 + this.vars.length*4));
		this.indexes = buf.subarray(0, numIndexes);
		/// Setup indexes
		let index = buf.subarray(numIndexes);
		let i = 0, j = 0;
		do {
			buf.copyWithin(j, numIndexes);
			j += this.vars.length;
		} while (Factor.nextCombination(varNumStates, index));
		*/
		
		/// Copy using plain JS array assignments
		/// This is currently the fastest version! The other two, which
		/// make use of native copies, are somehow slower
		this.indexes = new Uint32Array(new ArrayBuffer(numIndexes*4));
		/// Setup indexes
		let index = new Uint32Array(new ArrayBuffer(this.vars.length*4));
		let j = 0;
		do {
			for (let i=0; i<index.length; i++, j++) {
				this.indexes[j] = index[i];
			}
		} while (Factor.nextCombination(this.varNumStates, index));
		
		/*
		/// Copy using 'set'
		this.indexes = new Uint32Array(new ArrayBuffer(numIndexes*4));
		/// Setup indexes
		let index = new Uint32Array(new ArrayBuffer(this.vars.length*4));
		let j = 0;
		do {
			this.indexes.set(index, j);
			j += this.vars.length;
		} while (Factor.nextCombination(varNumStates, index));
		*/
	}
	
	static fromDef(nodeOrDef) {
		let def = nodeOrDef.def || nodeOrDef;
		return def.toFactor();
	}
	
	isUnitPotential() {
		let firstVal = this.values[0];
		let epsilon = 0.000001;
		for (let val of this.values) {
			if (Math.abs(val - firstVal) > epsilon) {
				return false;
			}
		}
		return true;
	}
	
	getDomain() { return this.vars.slice(); }
	
	size() { return this._size; }
	
	moveVarToStart(varb) {
		counters.moveVarToStart++;
		let varbI = this.vars.indexOf(varb);
		if (varbI==0)  return this;
		
		let preMul = 1;
		let postMul = 1;
		let newVars = [varb];
		let newVarNumStates = [this.varNumStates[varbI]];
		let varbMul = 0;
		for (let i=0; i<this.vars.length; i++) {
			if (i < varbI) {
				preMul *= this.varNumStates[i];
				newVars.push(this.vars[i]);
				newVarNumStates.push(this.varNumStates[i]);
			}
			else if (i > varbI) {
				postMul *= this.varNumStates[i];
				newVars.push(this.vars[i]);
				newVarNumStates.push(this.varNumStates[i]);
			}
			else {
				varbMul = this.varNumStates[i];
			}
		}
		let varbPostMul = varbMul * postMul;
		
		let newValues = allocFloat32(this.values.length);
		
		for (let i=0, j=0; i<this.values.length; i++) {
			/*console.log(
				(Math.floor(i/postMul)*varbPostMul % newValues.length),
				Math.floor(i/(preMul*postMul))*postMul,
				(i % postMul)
			);*/
			j =
				/// Jump forward by varbPostMul each iteration (module by the length of the array)
				(Math.floor(i/postMul)*varbPostMul % newValues.length)
				/// When we wrap around the modulo above, we need to move to the next group
				/// for the new front variable. This means translating from new (preMul*postMul) to old (just postMul)
				+ Math.floor(i/(preMul*postMul))*postMul
				/// Iterate through all the post combinations
				+ (i % postMul);
			/*if (newValues.constructor != this.values.constructor) {
				console.log(newValues.constructor, this.values.constructor);
			}*/
			newValues[i] = this.values[j];
			//newValues.set(this.values.slice(j,j+1), i);
		}
		//console.log(CALLNUM++, OPNUM+=this.values.length);
		/*let sum=0;
		var im=0;
		for (; im<2704615; im++)  sum++;*/
		//console.log(sum);
		
		//console.log(newVars, newVarNumStates);
		return new Factor().make(newVars, newVarNumStates, newValues);
	}
	
	reduce(varb, stateI) {
		counters.reduce++;
		let newIndexes = [];
		let newValues = [];
		
		let varbI = this.vars.indexOf(varb);
		let numVars = this.vars.length;
		
		/// Create a new list of indexes from matches only
		for (let i=0; i<this.indexes.length; i+=numVars) {
			if (this.indexes[i + varbI] == stateI) {
				let others = this.indexes.slice(i, i+numVars);
				others.splice(varbI,1);
				newIndexes.push(...others);
				newValues.push(this.values[i/numVars]);
			}
		}
		
		/// Create a new factor
		let factor = new Factor();
		
		/// vars
		factor.vars = this.vars.slice();
		factor.vars.splice(varbI, 1);
		/// varNumStates
		factor.varNumStates = new Uint32Array(Array.from(this.varNumStates).splice(varbI, 1));
		/// constants
		Object.assign(factor.constants, this.constants, {[varb]: stateI});
		/// indexes
		factor.indexes = newIndexes;
		/// values
		factor.values = newValues;
		
		return factor;
	}
	
	reduceZeros(threshold = 0) {
		let newIndexes = [];
		let newValues = [];
		/// Creates (for A,B,C, e.g.): {A: {}, B: {}, C: {}}
		let newVarStates = Object.assign( ...this.vars.map(v => {return {[v]: {}}}) );
		
		let numVars = this.vars.length;
		
		for (let i=0; i<this.indexes.length; i+=numVars) {
			if (Math.abs(this.values[i/numVars]) > threshold) {
				let index = this.indexes.slice(i, i+numVars);
				newIndexes.push( ...index );
				newValues.push( this.values[i/numVars] );
				for (let j=0; j<index.length; j++) {
					newVarStates[this.vars[j]][index[j]] = true;
				}
			}
		}
		
		let factor = new Factor();
		
		/// vars
		factor.vars = this.vars.slice();
		/// varNumStates
		factor.varNumStates = this.varNumStates.slice();
		/// indexes
		factor.indexes = newIndexes;
		/// values
		factor.values = newValues;

		/// constants
		let constants = {};
		let oldNumVars = factor.vars.length;
		/// Check if any constants created
		for (let [varb,states] of Object.entries(newVarStates)) {
			let keys = Object.keys(states);
			if (keys.length==1) {
				constants[varb] = keys[0];
				let i = factor.vars.indexOf(varb);
				/// Update vars, varNumStates and indexes
				factor.vars.splice(i, 1);
				factor.varNumStates = new Uint32Array(Array.from(factor.varNumStates).splice(i, 1));
				/// We have to strip out the i'th column (in a 1D array,
				/// representing a 2D array)
				let skip = 0;
				for (let j=0; j<factor.indexes.length; j++) {
					factor.indexes[j-skip] = factor.indexes[j];
					if (j%oldNumVars == i) {
						skip++;
					}
				}
				factor.indexes.length -= skip;
			}
		}
		Object.assign(factor.constants, this.constants, constants);
		
		return factor;
	}
	
	/// XXX: multiply and marginalize
	multiplySlower(otherFactor) {
		let factor = new Factor();

		let vars = this.vars.slice();
		let varNumStates = Array.from(this.varNumStates);
		
		let seen = new Set(vars);
		
		let origVarIndexes = {};
		for (let i=0; i<this.vars.length; i++) {
			origVarIndexes[this.vars[i]] = i;
		}
		
		/// The column index of common variables, 
		/// on both sides
		/// e.g. A,B,C and C,B,D gives [1,1] and [2,0]
		/// because B is index 1 in the first and second
		/// and C is index 2 in the first and index 0 in the second
		let common = [];

		/// Skip over vars already in original factor
		for (let i=0; i<otherFactor.vars.length; i++) {
			let v = otherFactor.vars[i];
			
			if (!seen.has(v)) {
				seen.add(v);
				
				vars.push(v);
				varNumStates.push(otherFactor.varNumStates[i]);
			}
			else {
				common.push([origVarIndexes[v], i]);
			}
		}
		
		let newNumValues = varNumStates.reduce((a,v) => a*v, 1);
		
		let values = new Float32Array(new ArrayBuffer(newNumValues*4));
		
		/// Now just fill in the values
		let thisIndex = new Uint32Array(new ArrayBuffer(this.vars.length*4));
		let newValuesI = 0;
		let origValueIndex = 0;
		do {
			//let commonValIndexes = common.map( ([origVarIndex]) => thisIndex[origVarIndex] );
			let commonValIndexes = [];
			for (let [thisVarIndex,] of common) {
				commonValIndexes.push(thisIndex[thisVarIndex]);
			}
			/// Find matching rows/values in other table for thisIndex
			/// XXX Can this be optimised? I believe if the factor is sparse,
			/// then we won't know where to jump to, so probably not
			for (let i=0; i<otherFactor.values.length; i++) {
				let otherIndex = otherFactor.indexes.slice(i*otherFactor.vars.length, (i+1)*otherFactor.vars.length);
				let match = true;
				for (let [j,[,otherVarIndex]] of common.entries()) {
					if (commonValIndexes[j] != otherIndex[otherVarIndex]) {
						match = false;
						break;
					}
				}
				if (match) {
					/// We have a match! Multiply, and store it in the appropriate location
					let mul = this.values[origValueIndex] * otherFactor.values[i];
					values[newValuesI] = mul;
					newValuesI++;
				}
			}
			origValueIndex++;
		} while (nextCombination(varNumStates, thisIndex));
		
		factor.make(vars, varNumStates, values);
		
		return factor;
	}

	static nextCombination(numStates, indexes) {
		for (let i=indexes.length-1; i>=0; i--) {
			indexes[i]++;
			if (indexes[i] >= numStates[i]) {
				indexes[i] = 0;
			}
			else {
				return true;
			}
		}
		return false;
	}
	
	/// XXX: multiply and marginalize
	multiply(otherFactor, factorCache = null) {
		let factor = new Factor();

		let vars = this.vars.slice();
		let varNumStates = Array.from(this.varNumStates);
		
		let seen = new Set(vars);
		
		let origVarIndexes = {};
		for (let i=0; i<this.vars.length; i++) {
			origVarIndexes[this.vars[i]] = i;
		}
		
		/// The column index of common variables, 
		/// on both sides
		/// e.g. A,B,C and C,B,D gives [1,1] and [2,0]
		/// because B is index 1 in the first and second
		/// and C is index 2 in the first and index 0 in the second
		let common = [];
		let commonCombos = 1;

		/// Skip over vars already in original factor
		for (let i=0; i<otherFactor.vars.length; i++) {
			let v = otherFactor.vars[i];
			
			if (!seen.has(v)) {
				seen.add(v);
				
				vars.push(v);
				varNumStates.push(otherFactor.varNumStates[i]);
			}
			else {
				common.push(new Uint32Array([origVarIndexes[v], i]));
				commonCombos *= otherFactor.varNumStates[i];
			}
		}
		
		let factorKey = this.vars.slice().sort().join('|')
			+ otherFactor.vars.slice().sort().join('|')
			+ vars.slice().sort().join('|');
		if (factorCache && factorCache[factorKey]) {
			//console.log('hit');
			//let f = factorCache[factorKey];
			//return new Factor().make(f.vars, f.varNumStates, f.values);
			//console.log('hit');
			return factorCache[factorKey];
		}
		
		varNumStates = new Uint32Array(varNumStates);
		let newNumValues = varNumStates.reduce((a,v) => a*v, 1);
		
		let values = new Float32Array(new ArrayBuffer(newNumValues*4));
		
		/// Now just fill in the values
		let thisIndex = new Uint32Array(new ArrayBuffer(this.vars.length*4));
		let newValuesI = 0;
		let origValueIndex = 0;
		let commonValIndexes = new Uint32Array(new ArrayBuffer(common.length*4));
		let otherFactorLength = otherFactor.values.length;
		let i = 0, j = 0;
		let match = false;
		let otherIndexStart = 0;
		let thisVarIndex = 0;
		let otherVarIndex = 0;
		let mul = 0;
		let key = 0;
		let others = null;
		let otherFactorCommonCache = new Array(commonCombos).fill(0).map(_ => new Float32Array(otherFactorLength/commonCombos));
		otherFactorCommonCache.forEach(list => list.currentI = 0);
		for (i=0; i<otherFactorLength; i++) {
			/// Calc cache key
			key = 0;
			for (j=0; j<common.length; j++) {
				otherVarIndex = common[j][1];
				key *= otherFactor.varNumStates[otherVarIndex];
				key += otherFactor.indexes[i*otherFactor.vars.length + otherVarIndex];
			}
			/// Store val
			otherFactorCommonCache[key][otherFactorCommonCache[key].currentI++] = otherFactor.values[i];
		}
		//console.log(otherFactorCommonCache);
		let newIndex = new Uint32Array(new ArrayBuffer(4*varNumStates.length));
		//console.log('indexes length', 4*newNumValues*vars.length);
		factor.indexes = new Uint32Array(new ArrayBuffer(4*newNumValues*vars.length));
		let offset = 0;
		do {
			key = 0;
			for (i=0; i<common.length; i++) {
				key *= this.varNumStates[ common[i][0] ];
				key += thisIndex[ common[i][0] ];
			}
			others = otherFactorCommonCache[key];
			for (i=0; i<others.length; i++) {
				values[newValuesI] = this.values[origValueIndex] * others[i];
				offset = newValuesI*vars.length;
				for (j=0; j<vars.length; j++) {
					factor.indexes[offset + j] = newIndex[j];
				}
				//factor.indexes.set(newIndex, offset);
				newValuesI++;
				Factor.nextCombination(varNumStates, newIndex);
			}
			origValueIndex++;
		} while (Factor.nextCombination(this.varNumStates, thisIndex));
		
		//factor.make(vars, varNumStates, values);
		factor.vars = vars;
		factor.varNumStates = varNumStates;
		factor.values = values;
		
		if (factorCache)  factorCache[factorKey] = factor;

		return factor;
	}
	
	multiplyFaster(otherFactor, factorCache = null) {
		counters.multiplyFaster++;
		/*let factorKey = null;
		if (factorCache) {
			factorKey = [...new Set(this.vars.concat(otherFactor.vars))].sort().join('|');
			if (factorCache[factorKey])  return factorCache[factorKey];
		}*/
		
		//console.log('MULTIPLYING:', this.getDomain(),otherFactor.getDomain());
		let newFactor = new Factor();

		let leftFactor = this;
		let rightFactor = otherFactor;

		let seen = new Set(leftFactor.vars);
		let common = [];
		let commonVarNumStates = [];
		let commonLength = 1;
		
		/// Find common factors
		for (let i=0; i<rightFactor.vars.length; i++) {
			let v = rightFactor.vars[i];
			
			if (seen.has(v)) {
				common.push(v);
				commonVarNumStates.push(rightFactor.varNumStates[i]);
				commonLength *= rightFactor.varNumStates[i];
			}
		}
		
		/// Rearrange both factors
		for (let i=common.length-1; i>= 0; i--) {
			leftFactor = leftFactor.moveVarToStart(common[i]);
			rightFactor = rightFactor.moveVarToStart(common[i]);
		}
		
		let leftDiffLength = leftFactor.varNumStates.slice(common.length).reduce((a,v) => a*v, 1);
		let rightDiffLength = rightFactor.varNumStates.slice(common.length).reduce((a,v) => a*v, 1);

		let vars = [...common, ...leftFactor.vars.slice(common.length), ...rightFactor.vars.slice(common.length)];
		let varNumStates = [...commonVarNumStates, ...leftFactor.varNumStates.slice(common.length), ...rightFactor.varNumStates.slice(common.length)];
		let values = new Float32Array(new ArrayBuffer(4*commonLength*leftDiffLength*rightDiffLength));
		
		/*let factorKey = leftFactor.vars.slice().sort().join('|')
			+ rightFactor.vars.slice().sort().join('|')
			+ vars.slice().sort().join('|');
		if (factorCache && factorCache[factorKey]) {
			//console.log('hit');
			//let f = factorCache[factorKey];
			//return new Factor().make(f.vars, f.varNumStates, f.values);
			//console.log('hit');
			return factorCache[factorKey];
		}*/
		
		/// Now multiply
		let valueI = 0;
		let i = 0, j = 0, k = 0;
		let leftFactorValue = 0;
		for (i=0; i<commonLength; i++) {
			for (j=0; j<leftDiffLength; j++) {
				leftFactorValue = leftFactor.values[i*leftDiffLength + j];
				if (leftFactorValue == 0) {
					valueI += rightDiffLength;
				}
				else {
					for (k=0; k<rightDiffLength; k++) {
						values[valueI] = leftFactorValue * rightFactor.values[i*rightDiffLength + k];
						valueI++;
					}
				}
			}
		}
		
		newFactor.make(vars, varNumStates, values);
		
		//if (factorCache)  factorCache[factorKey] = newFactor;

		return newFactor;
	}
	
	marginalize(ids, factorCache = null) {
		counters.marginalize++;
		let factor = new Factor();
		
		let varNumStates = [];
		let selectedI = [];
		let vars = this.vars.filter((v,i) => {
			let include = !ids.includes(v);
			if (include) {
				varNumStates.push(this.varNumStates[i]);
				selectedI.push(i);
			}
			return include;
		});
		
		let factorKey = this.vars.slice().sort().join('|')
			+ vars.slice().sort().join('|');
		if (factorCache && factorCache[factorKey]) {
			//console.log('hit');
			return factorCache[factorKey];
		}
		
		let newNumStates = varNumStates.reduce((a,v) => a*v, 1);
		
		let values = new Float32Array(new ArrayBuffer(newNumStates*4));
		
		let thisIndex = new Uint32Array(new ArrayBuffer(this.vars.length*4));
		let newIndex = new Uint32Array(new ArrayBuffer(vars.length*4));
		
		let i = 0;
		let iter = 0;
		let valueI = 0;
		do {
			valueI = 0;
			for (let j=0; j<selectedI.length; j++) {
				valueI = valueI*this.varNumStates[ selectedI[j] ] + thisIndex[ selectedI[j] ];
				iter++;
			}
			
			//valueI = newIndex.reduceRight((a,v,i) => a*varNumStates[i]+v, 0);
			//console.log(valueI);
			
			values[valueI] += this.values[i];
			
			i++;
		} while (Factor.nextCombination(this.varNumStates, thisIndex));
		//console.log('iterations:',iter,vars);
		
		factor.make(vars, varNumStates, values);
		
		if (factorCache)  factorCache[factorKey] = factor;
		
		return factor;
	}
	
	marginalize1(id, factorCache = null) {
		counters.marginalize1++;
		/*let factorKey = null;
		if (factorCache) {
			factorKey = this.vars.filter(v => v!=id).sort().join('|');
			if (factorCache[factorKey])  factorCache[factorKey];
		}*/
		
		let factor = new Factor();
		
		let varNumStates = [];
		let numMarginalStates = 0;
		let jump = 1;
		let vars = this.vars.filter((v,i) => {
			let include = v != id;
			if (include) {
				varNumStates.push(this.varNumStates[i]);
				if (numMarginalStates) {
					jump *= this.varNumStates[i];
				}
			}
			else {
				numMarginalStates = this.varNumStates[i];
			}
			return include;
		});
		
		let newNumStates = varNumStates.reduce((a,v) => a*v, 1);
		
		let values = new Float32Array(new ArrayBuffer(newNumStates*4));
		
		let i = 0, j = 0, group = 0;
		let iter = 0;
		let valueI = 0;
		for (i=0; i<values.length; i++) {
			group = Math.floor(i/jump)*(numMarginalStates*jump) + i%jump;
			for (j=0; j<numMarginalStates; j++) {
				values[i] += this.values[group + j*jump];
			}
		}
		
		factor.make(vars, varNumStates, values);
		
		//if (factorCache)  factorCache[factorKey] = factor;
		
		return factor;
	}
	
	/** This will multiply together all the given factors and marginalize down
		the results to all vars - |marginalVars| at the same time. This reduces
		both the amount of ops and memory allocations compared to each factor operation
		one by one
		
		This DOES NOT support factors that are in any way reduced. The full set
		of combinations for indexes must be present in every factor (and in the
		right order, etc.)
		**/
	static multiplyAndMarginalize(factors, marginalOrFinalVars, final = false) {
		let newFactor = new Factor();

		let finalVars = marginalOrFinalVars;
		if (!final) {
			let tempVars = [];
			for (let i=0; i<factors.length; i++) {
				tempVars.push(...factors[i].vars);
			}
			tempVars = [...new Set(tempVars)];
			finalVars = [];
			for (let i=0; i<tempVars.length; i++) {
				if (!marginalOrFinalVars.includes(tempVars[i])) {
					finalVars.push(tempVars[i]);
				}
			}
		}
		
		/// Get the intermediate full product factor
		/// (which won't ever be created)
		let vars = [];
		let varNumStates = [];
		let finalVarNumStates = [];
		let factorIndexMap = [];
		let seen = new Set();
		for (let i=0; i<factors.length; i++) {
			let factorVars = factors[i].vars;
			let factorVarNumStates = factors[i].varNumStates;
			factorIndexMap.push(new Uint32Array(new ArrayBuffer(4*factorVars.length)));
			for (let j=0; j<factorVars.length; j++) {
				let n = factorVars[j];
				if (!seen.has(n)) {
					vars.push(n);
					varNumStates.push(factorVarNumStates[j]);
					seen.add(n);
					let finalVarI = finalVars.indexOf(n);
					if (finalVarI > -1) {
						finalVarNumStates[finalVarI] = factorVarNumStates[j];
					}
				}
				factorIndexMap[i][j] = vars.indexOf(n);
			}
		}
		varNumStates = new Uint32Array(varNumStates);
		let mulIndex = new Uint32Array(new ArrayBuffer(4*vars.length));
		
		/// Set up the output factor
		newFactor.make(finalVars, finalVarNumStates);
		let newFactorMap = new Uint32Array(new ArrayBuffer(4*finalVars.length));
		for (let j=0; j<finalVars.length; j++) {
			newFactorMap[j] = vars.indexOf(finalVars[j]);
		}
		
		//console.log(factorIndexMap);
		//console.log(newFactorMap);
		
		let mul = 1;
		let i = 0;
		let j = 0;
		let factorI = 0;
		let factor = null;
		
		do {
			/// Go through each factor, and get matching value
			/// Multiply together
			mul = 1;
			for (i=0; i<factors.length; i++) {
				factor = factors[i];
				let fim = factorIndexMap[i];
				/// Extract parts of mulIndex that are relevant to current factor
				/// Get location in current factor
				factorI = 0;
				for (j=0; j<factor.vars.length; j++) {
					factorI = factorI*factor.varNumStates[j] + mulIndex[ fim[j] ];
				}
				mul *= factor.values[factorI];
			}
			/// Find right place in output factor, and add it there
			factorI = 0;
			for (j=0; j<newFactor.vars.length; j++) {
				factorI = factorI*newFactor.varNumStates[j] + mulIndex[ newFactorMap[j] ];
			}
			newFactor.values[factorI] += mul;
		} while (Factor.nextCombination(varNumStates, mulIndex));
		
		return newFactor;
	}
	
	toString() {
		let str = 'Factor('+this.vars.join(',')+'):\n';
		let n = this.vars.length;
		for (let i=0; i<this.values.length; i++) {
			str += this.indexes.slice(i*n, i*n+n).join('\t');
			str += '\t|\t' + this.values[i]+'\n';
		}
		return str;
	}
	
	/// For .mb file format saving, predominantly
	getContent() {
		return this.funcText;
	}
	
	static testMultiply() {
		/*let f = new Factor();
		console.time('makeFac');
		f.make("a b c d e f g h i j k l".split(/ /), new Array(12).fill(4));
		console.log('Size:', f.size());
		console.timeEnd('makeFac');*/
		//console.log(f.toString());
		
		let f1 = new Factor();
		f1.make(['a','d'], new Array(2).fill(2), [0.25,0.1,0.5,0.6]);
		let f2 = new Factor();
		f2.make(['b','d'], new Array(2).fill(2), [0.5,0.8,0.1,0.2]);
		
		console.log(f1.toString());
		console.log(f2.toString());
		console.log(f1.multiply(f2).toString());

		let f3 = new Factor();
		f3.make(['b','d'], new Array(2).fill(3), [0.5,0,0.8,0,0.1,0.2,0,0,0]);
		console.log(f3.toString());
		console.log(f3.reduceZeros().toString());
		
		console.log('Separate:', f1.toString());
		console.log('Combined:', Factor.multiplyAndMarginalize([f1], ['a','d'], true).toString());
		console.log('Combined2:', Factor.multiplyAndMarginalize([f1], []).toString());

		console.log('Separate:', f1.marginalize1('d').toString());
		console.log('Combined:', Factor.multiplyAndMarginalize([f1], ['a'], true).toString());
		console.log('Combined2:', Factor.multiplyAndMarginalize([f1], ['d']).toString());

		console.log('Separate:', f1.multiply(f2).toString());
		console.log('Combined:', Factor.multiplyAndMarginalize([f1,f2], ['a','b','d'], true).toString());
		console.log('Combined2:', Factor.multiplyAndMarginalize([f1,f2], []).toString());
		console.log('New multiply:', f1.multiplyFaster(f2).toString());

		console.log('Separate:', f1.multiply(f2).marginalize1('b').toString());
		console.log('Combined:', Factor.multiplyAndMarginalize([f1,f2], ['a','d'], true).toString());
		console.log('Combined2:', Factor.multiplyAndMarginalize([f1,f2], ['b']).toString());
		console.log('New multiply:', f1.multiplyFaster(f2).marginalize1('b').toString());

		console.log('Separate:', f1.multiply(f2).multiply(f2).marginalize1('b').marginalize1('d').toString());
		console.log('Combined:', Factor.multiplyAndMarginalize([f1,f2,f2], ['a'], true).toString());
		console.log('Combined2:', Factor.multiplyAndMarginalize([f1,f2,f2], ['b','d']).toString());
		console.log('New multiply:', f1.multiplyFaster(f2).multiplyFaster(f2).marginalize1('b').marginalize1('d').toString());

		let f4 = new Factor().make(['a','b','c'], [2,2,3], new Array(12).fill(0).map(_=>Math.round(Math.random()*100)/100));
		console.log('M:', f4.marginalize('b').toString());
		console.log('M:', f4.marginalize1('b').toString());
		
		console.log('move orig:', f4.toString());
		console.log('move c:', f4.moveVarToStart('c').toString());
		console.log('move b:', f4.moveVarToStart('b').toString());
	}
};

var NodeDefinitions = {
	CPT, CDT, Equation, NoisyOr: NoisyOrDef, WeightedSum
};
CPT.typeLabel = 'Probability Table';
CDT.typeLabel = 'Deterministic Table';
Equation.typeLabel = 'Equation';
NoisyOrDef.typeLabel = 'Noisy OR';
WeightedSum.typeLabel = 'Weighted Sum';

if (typeof(exports)!='undefined') {
	for (let def in NodeDefinitions) {
		exports[def] = NodeDefinitions[def];
	}
	Object.assign(exports, {
		NodeDefinitions,
		Factor,
	});
}