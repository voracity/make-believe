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
		if (this.node && this.node.net)  this.node.net.needsCompile ||= _needsCompile;
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
			this.cpt = new Float32Array(this.node.numParentCombinations()*this.node.states.length);
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
		let conditionals = this.node.parents.map(p=>p.id);
		/// Push parents
		for (let parent of this.node.parents) {
			vars.push(parent.id);
			varNumStates.push(parent.states.length);
		}
		/// Push me
		vars.push(this.node.id);
		varNumStates.push(this.node.states.length);
		
		/// Make factor
		factor.make(vars, varNumStates, this.node.intervene ? this._makeUniform(this.cpt) : this.cpt, conditionals);
		factor.keyNode = this.node.id;
		
		return factor;
	}
	
	compile(o = {}) {
		o.force = o.force || false;
		//var node = this.node;
		if (o.force || this.needsCompile) {
			if (this.cpt && this.cpt.length) {
				var newCpt = new Float32Array(this.cpt.length);
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
		let newCpt = new Float32Array(cpt.length);
		for (var i=0; i<newCpt.length; i++)  newCpt[i] = 1/this.node.states.length;
		return newCpt;
	}
	
	setUniform() {
		this.cpt = new Float32Array(this.node.numParentCombinations()*this.node.states.length);
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
	
	get2d() {
		let cpt2d = [];
		for (let i=0; i<this.cpt.length; i+=this.node.states.length) {
			cpt2d.push(this.cpt.slice(i,i+this.node.states.length));
		}
		return cpt2d;
	}
	
	randomize() {
		for (var i=0; i<this.cpt.length; i++) {
			this.cpt[i] = Math.random();
		}
		this.normalize();
		this.cpt = this.cpt.map(c => sigFig(c, 2));
		for (let i=0; i<this.getNumRows(); i++) {
			let row = this.getRow(i);
			row[row.length-1] = 1 - row.slice(0, row.length-1).reduce((a,v)=>a+v,0);
			this.setRow(i, row);
		}
		
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
	
	getParentStates(rowI) {
		let i = rowI*this.node.states.length;
		var multiplier = 1;
		var parentState = -1;
		var chunk = 0;
		let parentStates = this.node.parents.map(_=>-1);
		let curLength = this.cpt.length;
		for (var pi=0; pi<this.node.parents.length; pi++) {
			chunk = curLength/this.node.parents[pi].states.length;
			parentStates[pi] = Math.floor(i/chunk);
			i -= parentStates[pi]*chunk;
			curLength = chunk;
		}
		return parentStates;
	}
	
	getNamedParentStates(rowI) {
		let parentStates = this.getParentStates(rowI);
		return parentStates.map((ps,pi) => this.node.parents[pi].states[ps].id);
	}
	
	getNamedParentStatesMap(rowI) {
		let parentStates = this.getParentStates(rowI);
		return Object.fromEntries(parentStates.map((ps,pi) => [this.node.parents[pi].id,this.node.parents[pi].states[ps].id]));
	}
	
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
			var newCpt = new Float32Array(rows*newNumStates);
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
			var newCpt = new Float32Array(rows*newNumStates);
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
		sampling.case = new Int32Array(numNodes);
		sampling.case[0] = 2;
		sampling.evidence = new Int32Array(numNodes).fill(-1);
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
		this.funcTable = new Int32Array(this.node.numParentCombinations());
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
		let conditionals = this.node.parents.map(p=>p.id);
		/// Push parents
		for (let parent of this.node.parents) {
			vars.push(parent.id);
			varNumStates.push(parent.states.length);
		}
		/// Push me
		vars.push(this.node.id);
		varNumStates.push(this.node.states.length);
		
		/// Reconstruct prob values
		let values = [];
		for (let i=0; i<this.funcTable.length; i++) {
			let arr = new Float32Array(this.node.states.length);
			arr[this.funcTable[i]] = 1;
			values.push(...arr);
		}
		
		/// Make factor
		factor.make(vars, varNumStates, values, conditionals);
		
		/// XXX: Reduce 0s should eventually work, but not sure if it does right now
		/// If it does, better would be to just create factor without the 0s in the first place
		
		return factor;
	}
	
	compile(o = {}) {
		o.force = o.force || false;
		var node = this;
		if (o.force || this.needsCompile) {
			if (this.funcTable && this.funcTable.length) {
				var newFt = new Int32Array(this.funcTable.length);
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
		let cpt = new Float32Array(this.node.numParentCombinations()*this.node.states.length);
		for (let i=0; i<this.funcTable.length; i++) {
			cpt[this.node.states.length*i + this.funcTable[i]] = 1;
		}
		
		return new CPT(this.node, cpt);
	}
	
	setInitial() {
		this.funcTable = new Int32Array(this.node.numParentCombinations());
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
		sampling.case = new Int32Array(numNodes);
		sampling.case[0] = 1;
		sampling.evidence = new Int32Array(numNodes).fill(-1);
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
				this.parentStates = new Float32Array(this.node.parents.length);
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
		
		let cpt = new Float32Array(numParentCombinations*numStates);
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
		sampling.case = new Int32Array(numNodes);
		sampling.case[0] = 1;
		sampling.caseTypes = new Int32Array(numNodes).fill(CASE_REAL_VALUE);
		sampling.caseReal = new Float32Array(numNodes).fill(3.2);
		sampling.evidence = new Int32Array(numNodes).fill(-1);
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
		
		let cpt = new Float32Array(numParentCombinations*numStates);
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
		
		let cpt = new Float32Array(numParentCombinations*numStates);
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
	static factorNum = 0;
	static factors = [];
	constructor() {
		this.factorNum = Factor.factorNum++;
		/// For debugging:
		dbg(_=>Factor.factors.push(this));
		/// e.g. A, B, C
		this.vars = [];
		/// e.g. 3,6,2 means A has 3 states, B has 6 states, C has 2 states
		this.varNumStates = [];
		/// These are the remaining active/conditioning states for each var (e.g. evidence, or after multiplied
		/// by another factor with only certain states active)
		this.activeStates = [];
		/// A (possibly partial) enumeration of the cross product for this factor (all possible var combinations)
		/// e.g.: 0 0 0, 0 0 1, 0 1 0, 0 1 1, 0 2 0, 0 2 1, 0 3 0, etc.
		/// This will be partial if some combinations have been reduced/eliminated
		/// This is stored as a one dimensional array, to reduce memory overhead
		this.indexes = [];
		/// Values associated with the indexes. Of course, it must be that indexes.length/vars.length == values.length
		this.values = [];
		this.positions = [];
		/// Any constants associated with this factor, e.g.: {C: 1}
		this.constants = {};
		/// Any variables that would be on the conditional side (e.g. B,C in P(A|B,C))
		this.conditionals = [];
		this.unconditionals = [];
		dbg(_=>{
			/// Debugging
			this.childFactors = []; /// i.e. child as a result of multiplication or marginalisation
			this.temp = false;
		});
	}
	
	findDescendants() {
		let toVisit = [this];
		let found = [];
		while (toVisit.length) {
			let next = toVisit.shift();
			found.push(next);
			toVisit.push(...next.childFactors);
		}
		return found;
	}
	
	make(vars, varNumStates, values = null, conditionals = null, activeStates = null) {
		counters.make++;
		//this.vars = vars.slice();
		//this.varNumStates = new Uint32Array(varNumStates);
		this.vars = vars;
		this.varNumStates = varNumStates;
		this.activeStates = activeStates ?? varNumStates.map(_=>null);
		this.conditionals = conditionals ?? [];
		this.unconditionals = [...new Set(this.vars).difference(this.conditionals)];
		
		//this.makeIndexes();
		this.calcPositions();
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
	
	select(varStates) {
		let fac = new Factor();
		
		let varStatesI = Object.fromEntries(Object.entries(varStates).map(([k,v]) => [this.vars.indexOf(k),v]));

		let activeStates = this.activeStates.slice();
		Object.entries(varStatesI).forEach(([i,v]) => activeStates[i] = Array.isArray(v) ? v : [v]);
		let varNumStates = activeStates.map((a,i) => a==null ? this.varNumStates[i] : a.length);
		let values = new Float32Array(varNumStates.reduce((a,v)=>a*v,1));
		let indexes = varNumStates.map(_=>0);
		let identityMap = varI => Array.from({length:varNumStates[varI]},(_,i)=>i);
		let indexMap = activeStates.map((active,k) => active == null ? identityMap(k) : active.map((s,i) => this.activeStates[k]==null ? s : this.activeStates[k].indexOf(s)));
		// Do select
		for (let i=0; i<values.length; i++) {
			let oldI = indexes.map((s,vi) => indexMap[vi][s]*this.positions[vi]).reduce((a,v)=>a+v,0);
			values[i] = this.values[oldI];
			Factor.nextCombination(varNumStates, indexes);
		}
		
		fac.make(this.vars, varNumStates, values, this.conditionals, activeStates);
		
		return fac;
	}
	
	makeIndexes() {
		counters.makeIndexes++;
		let numIndexes = this.varNumStates.reduce((a,v) => a*v, 1) * this.vars.length;
		/*
		/// Copy using 'copyWithin'
		let buf = new Uint32Array(numIndexes + this.vars.length);
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
		this.indexes = new Uint32Array(numIndexes);
		/// Setup indexes
		let index = new Uint32Array(this.vars.length);
		let j = 0;
		do {
			for (let i=0; i<index.length; i++, j++) {
				this.indexes[j] = this.activeStates[i]==null ? index[i] : this.activeStates[i][index[i]];
			}
		} while (Factor.nextCombination(this.varNumStates, index));
		
		/*
		/// Copy using 'set'
		this.indexes = new Uint32Array(numIndexes);
		/// Setup indexes
		let index = new Uint32Array(this.vars.length);
		let j = 0;
		do {
			this.indexes.set(index, j);
			j += this.vars.length;
		} while (Factor.nextCombination(varNumStates, index));
		*/
	}
	
	static fromDef(nodeOrDef) {
		let def = nodeOrDef.def || nodeOrDef;
		let fac = def.toFactor();
		// for (let i=0; i<fac.values.length; i++)  fac.values[i] *= 2;
		return fac;
	}
	
	isUnitPotential() {
		if (this._isUnitPotential!=null)  return this._isUnitPotential;
		let vals = this.values;
		let valsLength = vals.length;
		let testVal = vals[0];
		if (testVal == 0) {
			for (let i=0; i<valsLength; i++) {
				if (vals[i] != 0) {
					this._isUnitPotential = false;
					return false;
				}
			}
			this._isUnitPotential = true;
			return true;
		}
		else {
			// If there is at least one selection on this factor,
			// this is not a unit potential
			let activeStates = this.activeStates;
			let activeStatesLength = this.activeStates.length;
			for (let i=0; i<activeStatesLength; i++) {
				if (activeStates[i] != null)  return false;
			}
			let epsilon = 0.001;
			for (let i=0; i<valsLength; i++) {
				if (Math.abs(vals[i]/testVal  - 1) > epsilon) {
					this._isUnitPotential = false;
					return false;
				}
			}
			this._isUnitPotential = true;
			return true;
		}
	}
	
	addVars(vars, varNumStates, mul=1, conditionals, activeStates) {
		let factor = new Factor();
		let endVars = [...new Set(vars).difference(this.vars)];
		let endVarNumStates = endVars.map(v => varNumStates[vars.indexOf(v)]);
		factor.vars = this.vars.concat(endVars);
		factor.varNumStates = this.varNumStates.concat(endVarNumStates);
		factor.values = new Float32Array(factor.varNumStates.reduce((a,v)=>a*v,1));
		factor.conditionals = this.conditionals.concat(conditionals);
		factor.activeStates = this.activeStates.concat(JSON.parse(JSON.stringify(activeStates)));
		dbg(_=>{this.childFactors.push(factor);});
		let endVarLength = endVarNumStates.reduce((a,v)=>a*v,1);
		
		for (let i=0; i<this.values.length; i++) {
			for (let j=0; j<endVarLength; j++) {
				factor.values[i*endVarLength+j] = this.values[i]*mul;
			}
		}
		
		factor.make(factor.vars, factor.varNumStates, factor.values, factor.conditionals, factor.activeStates);
		
		return factor;
	}
	
	getDomain() { return this.vars.slice(); }
	
	size() { return this._size; }
	
	moveVarsToStart(vars) {
		let newValues = new Float32Array(this.values.length);
		let endVars = [...new Set(this.vars).difference(vars)];
		let newVars = vars.concat(endVars);
		let oldToNew = this.vars.map(v => newVars.indexOf(v));
		let newVarNumStates = newVars.map(v => this.varNumStates[this.vars.indexOf(v)]);
		let fac = new Factor().make(newVars, newVarNumStates, newValues);
		fac.calcPositions();
		this.calcPositions();
		
		// let thisIndexes = new Uint32Array(this.vars.length);
		for (let i=0; i<this.values.length; i++) {
			let newPos = 0;
			for (let j=0; j<this.vars.length; j++) {
				newPos += this.getState(i, j)*fac.positions[oldToNew[j]];
			}
			newValues[newPos] = this.values[i];
		}
		
		return fac;
	}
	
	moveVarsToStart2(vars) {
		let i=0;
		for (i=0; i<vars.length; i++)  if (this.vars[i]!=vars[i])  break;
		if (i==vars.length)  return this;
		// if (this.vars.join('+').startsWith(vars.join('+')))  return this;
		let newValues = new Float32Array(this.values.length);
		// let endVars = [...new Set(this.vars).difference(vars)];
		// let endVars = [];
		let newVars = vars.slice();
		let varSet = new Set(vars);
		for (let i=0; i<this.vars.length; i++) {
			if (!varSet.has(this.vars[i])) {
				// endVars.push(this.vars[i]);
				newVars.push(this.vars[i]);
			}
		}
		let oldToNew = this.vars.map(v => newVars.indexOf(v)); /// This adds time
		let newVarNumStates = newVars.map(v => this.varNumStates[this.vars.indexOf(v)]);
		let fac = new Factor().make(newVars, newVarNumStates, newValues);
		fac.calcPositions();
		this.calcPositions();
		let mappedPositions = oldToNew.map(n => fac.positions[n]);
		
		let oldIndexes = new Uint32Array(this.vars.length);
		/*function nextCombination(numStates, indexes, curPos, positions) {
			for (let i=indexes.length-1; i>=0; i--) {
				indexes[i]++;
				if (indexes[i] >= numStates[i]) {
					curPos -= (indexes[i]-1)*positions[i];
					indexes[i] = 0;
				}
				else {
					curPos += positions[i];
					return curPos;
				}
			}
			return curPos;
		}*/
		
		let newPos = 0;
		let numStates = this.varNumStates;
		let indexes = oldIndexes;
		let positions = mappedPositions;
		for (let i=0; i<this.values.length; i++) {
			newValues[newPos] = this.values[i];
			// newPos = nextCombination(numStates, indexes, newPos, positions);
			for (let j=indexes.length-1; j>=0; j--) {
				indexes[j]++;
				if (indexes[j] >= numStates[j]) {
					newPos -= (indexes[j]-1)*positions[j];
					indexes[j] = 0;
				}
				else {
					newPos += positions[j];
					break;
				}
			}
		}
		
		return fac;  
		//return this;
	}
	
	moveVarToStart(varb, factorCache = null, inPlace = false) {
		counters.moveVarToStart++;
		let varbI = this.vars.indexOf(varb);
		if (varbI==0)  return this;
		// let factorKey = null;
		// if (factorCache) {
			// let varsSorted = this.vars.slice().sort();
			// let varbSortedI = varsSorted.indexOf(varb);
			// let varbStart = [varb].concat(varsSorted.slice(0,varbI), varsSorted.slice(varbI+1));
			// factorKey = '[MOVEVAR]:'+varbStart.join('|');
			// if (factorKey in factorCache)  return factorCache[factorKey];
		// }
		
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
		
		let newValues = new Float32Array(this.values.length);
		
		var j = 0;
		for (let i=0; i<this.values.length; i++) {
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
		if (inPlace) {
			this.vars = newVars;
			this.varNumStates = newVarNumStates;
			this.values = newValues;
			return this;
		}
		else {
			let fac = new Factor().make(newVars, newVarNumStates, newValues);
			// if (factorCache)  factorCache[factorKey] = fac;
			return fac;
		}
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
		
		let values = new Float32Array(newNumValues);
		
		/// Now just fill in the values
		let thisIndex = new Uint32Array(this.vars.length);
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
			if (isNaN(numStates[i]))  return false;
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
	/// This needs makeIndexes() to be run first
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
		
		let values = new Float32Array(newNumValues);
		
		/// Now just fill in the values
		let thisIndex = new Uint32Array(this.vars.length);
		let newValuesI = 0;
		let origValueIndex = 0;
		let commonValIndexes = new Uint32Array(common.length);
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
		let newIndex = new Uint32Array(varNumStates.length);
		//console.log('indexes length', 4*newNumValues*vars.length);
		factor.indexes = new Uint32Array(newNumValues*vars.length);
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
		// console.log(this.vars, otherFactor.vars, this.values, otherFactor.values);
		counters.multiplyFaster++;
		//console.log('MULTIPLYING:', this.getDomain(),otherFactor.getDomain());
		let newFactor = new Factor();
		// console.time('fulMul');

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
		let moves = 0;
		/*for (let i=common.length-1; i>= 0; i--) {
			leftFactor = leftFactor.moveVarToStart(common[i], factorCache);
			rightFactor = rightFactor.moveVarToStart(common[i], factorCache);
			// console.log('move');
			moves++;
		}*/
		leftFactor = leftFactor.moveVarsToStart2(common);
		rightFactor = rightFactor.moveVarsToStart2(common);
		// let leftCond = new Set(leftFactor.conditional);
		// let leftUncond = new Set(leftFactor.vars).difference(leftCond)
		// let rightCond = new Set(rightFactor.conditional);
		// let rightUncond = new Set(rightFactor.vars).difference(rightCond)
		
		// rightCond = rightCond.difference(leftUncond.intersection(rightCond));
		// leftCond = leftCond.difference(rightUncond.intersection(leftCond));
		// let newCond = rightCond.union(leftCond);
		// newFactor.conditional = [...newCond];
		
		let leftDiffLength = leftFactor.varNumStates.slice(common.length).reduce((a,v) => a*v, 1);
		let rightDiffLength = rightFactor.varNumStates.slice(common.length).reduce((a,v) => a*v, 1);

		let vars = [...common, ...leftFactor.vars.slice(common.length), ...rightFactor.vars.slice(common.length)];
		let varNumStates = [...commonVarNumStates, ...leftFactor.varNumStates.slice(common.length), ...rightFactor.varNumStates.slice(common.length)];
		let values = new Float32Array(commonLength*leftDiffLength*rightDiffLength);
		// console.log('factor size:', values.length, vars.length, moves);
		// console.time('mul');
		// let factorKey = null;
		// if (factorCache) {
			// factorKey = vars.toSorted().join('+') + '|' + newFactor.conditional.toSorted().join('+');
			// // console.log(factorKey);
			// if (factorCache[factorKey])  return factorCache[factorKey];
		// }
		// let values = new Float32Array(commonLength*leftDiffLength*rightDiffLength);
		
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
		
		// console.timeEnd('mul');
		// console.timeEnd('fulMul');
		newFactor.make(vars, varNumStates, values);
		
		// if (factorCache)  factorCache[factorKey] = newFactor;

		return newFactor;
	}
	
	calcPositions() {
		if (this.positions.length)  return;
		this.positions = new Uint32Array(this.vars.map(_=>0));
		let mul = 1;
		for (let i=this.vars.length-1;i>=0;i--) {
			this.positions[i] = mul;
			mul *= this.varNumStates[i];
		}
	}
	
	getState(rowI, varI) {
		return Math.floor(rowI/this.positions[varI])%this.varNumStates[varI];
	}
	
	multiplyFaster2(otherFactor, factorCache = null) {
		counters.multiplyFaster2++;

		let newFactor = new Factor();

		let leftFactor = this;
		let rightFactor = otherFactor;

		let seen = new Set(leftFactor.vars);
		let common = [];
		let commonVarNumStates = [];
		let commonLength = 1;
		
		let leftCommonVarI = [];
		let rightCommonVarI = [];
		let rightNotCommonVarI = [];
		
		/// Find common factors
		let rightDiffFactor = new Factor();
		for (let i=0; i<rightFactor.vars.length; i++) {
			let v = rightFactor.vars[i];
			
			if (seen.has(v)) {
				common.push(v);
				leftCommonVarI.push(leftFactor.vars.indexOf(v));
				rightCommonVarI.push(rightFactor.vars.indexOf(v));
				commonVarNumStates.push(rightFactor.varNumStates[i]);
				commonLength *= rightFactor.varNumStates[i];
			}
			else {
				rightNotCommonVarI.push(rightFactor.vars.indexOf(v));
				rightDiffFactor.vars.push(v);
				rightDiffFactor.varNumStates.push(rightFactor.varNumStates[i]);
				// rightDiffNotCommonVarI.push(rightDiffFactor.vars.length-1);
			}
		}
		leftFactor.calcPositions();
		rightFactor.calcPositions();
		rightDiffFactor.calcPositions();
		leftCommonVarI = new Uint32Array(leftCommonVarI);
		rightCommonVarI = new Uint32Array(rightCommonVarI);
		rightNotCommonVarI = new Uint32Array(rightNotCommonVarI);
		
		let leftDiffLength = leftFactor.varNumStates.slice(common.length).reduce((a,v) => a*v, 1);
		let rightDiffLength = rightFactor.varNumStates.slice(common.length).reduce((a,v) => a*v, 1);

		let vars = [...leftFactor.vars, ...rightDiffFactor.vars];
		let varNumStates = [...leftFactor.varNumStates, ...rightDiffFactor.varNumStates];
		let values = new Float32Array(commonLength*leftDiffLength*rightDiffLength);
		
		// let commonVarStates = Array.from({length: common.length});
		let i=0, ci=0, j=0, k=0, leftV=0, partialRightPos=0, rightPos=0, rightV=0, leftState=0;
		let thisPositions = this.positions, rightPositions = rightFactor.positions, rightDiffPositions = rightDiffFactor.positions;
		let thisVarNumStates = new Uint32Array(this.varNumStates);
		let rightDiffNumStates = new Uint32Array(rightDiffFactor.varNumStates);
		// console.log(leftCommonVarI, rightCommonVarI, rightDiffPositions);
		for (i=0; i<leftFactor.values.length; i++) {
			/// Compute what the indexes of the common vars are for this row of the factor (i.e. value, which is associated with row)
			leftV = leftFactor.values[i];
			partialRightPos = 0;
			
			for (ci=0; ci<leftCommonVarI.length; ci++) {
				// commonVarStates[ci] = leftFactor.getState(i, leftCommonVarI[ci]);
				// console.log(leftState, leftV);
				// partialRightPos += commonVarStates[ci]*rightFactor.positions[rightCommonVarI[ci]];
				partialRightPos += (Math.floor(i/thisPositions[leftCommonVarI[ci]])%thisVarNumStates[leftCommonVarI[ci]])*rightPositions[rightCommonVarI[ci]];
				// console.log(partialRightPos);
			}
			
			for (j=0; j<rightDiffLength; j++) {
				/// Convert each the indexes into
				
				rightPos = partialRightPos;
				for (k=0; k<rightDiffFactor.vars.length; k++) {
					rightPos += (Math.floor(j/rightDiffPositions[k])%rightDiffNumStates[k]) * rightPositions[rightNotCommonVarI[k]];
				}
				values[i*rightDiffLength + j] = leftV*rightFactor.values[rightPos];
			}
		}
		
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
		
		newFactor.make(vars, varNumStates, values);
		
		//if (factorCache)  factorCache[factorKey] = newFactor;

		return newFactor;
	}
	
	/// Maybe?
	multiplyFaster3(otherFactor, factorCache = null) {
		counters.multiplyFaster3++;

		let newFactor = new Factor();

		let leftFactor = this;
		let rightFactor = otherFactor;
		let leftZeroCount = 0, rightZeroCount = 0;
		for (let i=0;i<leftFactor.values.length && i<20;i++){
			if (leftFactor.values[i]==0) leftZeroCount++;
		}
		for (let i=0;i<rightFactor.values.length && i<20;i++){
			if (rightFactor.values[i]==0) rightZeroCount++;
		}
		if (rightZeroCount>leftZeroCount) [leftFactor,rightFactor] = [rightFactor,leftFactor];


		let seen = new Set(leftFactor.vars);
		/// Find common factors
		let rightDiffFactor = new Factor();
		for (let i=0; i<rightFactor.vars.length; i++) {
			let v = rightFactor.vars[i];
			
			if (!seen.has(v)) {
				rightDiffFactor.vars.push(v);
				rightDiffFactor.varNumStates.push(rightFactor.varNumStates[i]);
			}
		}
		leftFactor.calcPositions();
		rightFactor.calcPositions();
		rightDiffFactor.calcPositions();
		
		let rightDiffLength = rightDiffFactor.varNumStates.reduce((a,v)=>a*v,1);
		
		let vars = [...leftFactor.vars, ...rightDiffFactor.vars];
		let varNumStates = [...leftFactor.varNumStates, ...rightDiffFactor.varNumStates];
		let values = new Float32Array(leftFactor.values.length*rightDiffLength);
		let conditionals = [...new Set(leftFactor.conditionals).difference(rightFactor.unconditionals).union(new Set(rightFactor.conditionals).difference(leftFactor.unconditionals))];
		
		let i=0, ci=0, j=0, k=0, leftV=0, partialRightPos=0, rightPos=0, rightV=0, leftState=0;
		let thisPositions = this.positions, rightPositions = rightFactor.positions;
		let leftNumStates = new Uint32Array(leftFactor.varNumStates);
		let rightDiffNumStates = new Uint32Array(rightDiffFactor.varNumStates);
		let leftIndexes = new Uint32Array(leftFactor.varNumStates.length);
		let rightDiffIndexes = new Uint32Array(rightDiffFactor.varNumStates.length);
		let leftPositions = leftFactor.vars.map(v => rightFactor.positions[rightFactor.vars.indexOf(v)] ?? 0);
		let rightDiffPositions = rightDiffFactor.vars.map(v => rightFactor.positions[rightFactor.vars.indexOf(v)] ?? 0);
		let leftPartialPos = 0, rightDiffPartialPos = 0;
		let rightDiffGroup = 0, rdiLength = rightDiffIndexes.length-1, ldiLength = leftIndexes.length-1;
		for (i=0; i<leftFactor.values.length; i++) {
			/// Compute what the indexes of the common vars are for this row of the factor (i.e. value, which is associated with row)
			leftV = leftFactor.values[i];
			/// For each left value, find the associated right value, then mul
			if (leftV != 0) {
				rightDiffGroup = i*rightDiffLength;
				
				for (j=0; j<rightDiffLength; j++) {
					/// Convert each the indexes into
					
					values[rightDiffGroup + j] = leftV*rightFactor.values[leftPartialPos + rightDiffPartialPos];

					/// Manually inling this is way faster (and no stack use at all)
					for (k=rdiLength; k>=0; k--) {
						rightDiffIndexes[k]++;
						if (rightDiffIndexes[k] >= rightDiffNumStates[k]) {
							rightDiffPartialPos -= (rightDiffIndexes[k]-1)*rightDiffPositions[k];
							rightDiffIndexes[k] = 0;
						}
						else {
							rightDiffPartialPos += rightDiffPositions[k];
							break;
						}
					}
				}
			}
			for (k=ldiLength; k>=0; k--) {
				leftIndexes[k]++;
				if (leftIndexes[k] >= leftNumStates[k]) {
					leftPartialPos -= (leftIndexes[k]-1)*leftPositions[k];
					leftIndexes[k] = 0;
				}
				else {
					leftPartialPos += leftPositions[k];
					break;
				}
			}
		}
		
		newFactor.make(vars, varNumStates, values, conditionals);
		
		return newFactor;
	}
	
	/// Maybe?
	multiplyFaster4(otherFactor) {
		counters.multiplyFaster4++;

		let newFactor = new Factor();

		let leftFactor = this;
		let rightFactor = otherFactor;

		/// Find common factors
		let common = new Set(leftFactor.vars).intersection(rightFactor.vars);
		let commonFactor = new Factor();
		let leftDiffFactor = new Factor();
		let rightDiffFactor = new Factor();
		commonFactor.temp = leftDiffFactor.temp = rightDiffFactor.temp = true;
		for (let i=0; i<leftFactor.vars.length; i++) {
			let v = leftFactor.vars[i];
			
			if (!common.has(v)) {
				leftDiffFactor.vars.push(v);
				leftDiffFactor.varNumStates.push(leftFactor.varNumStates[i]);
				leftDiffFactor.activeStates.push(leftFactor.activeStates[i]);
			}
			else {
				commonFactor.vars.push(v);
				commonFactor.varNumStates.push(leftFactor.varNumStates[i]);
				commonFactor.activeStates.push(leftFactor.activeStates[i]);
			}
		}
		for (let i=0; i<rightFactor.vars.length; i++) {
			let v = rightFactor.vars[i];
			
			if (!common.has(v)) {
				rightDiffFactor.vars.push(v);
				rightDiffFactor.varNumStates.push(rightFactor.varNumStates[i]);
				rightDiffFactor.activeStates.push(rightFactor.activeStates[i]);
			}
			else {
				let ci = commonFactor.vars.indexOf(v);
				commonFactor.activeStates[ci] = 
					commonFactor.activeStates[ci]==null ? rightFactor.activeStates[i]
						: rightFactor.activeStates[i]==null ? commonFactor.activeStates[ci]
						: [...new Set(rightFactor.activeStates[i]).intersection(commonFactor.activeStates[ci])];
				commonFactor.varNumStates[ci] = commonFactor.activeStates[ci]?.length ?? rightFactor.varNumStates[i];
			}
		}
		leftFactor.calcPositions();
		rightFactor.calcPositions();
		commonFactor.calcPositions();
		leftDiffFactor.calcPositions();
		rightDiffFactor.calcPositions();
		
		let commonLength = commonFactor.varNumStates.reduce((a,v)=>a*v,1);
		let leftDiffLength = leftDiffFactor.varNumStates.reduce((a,v)=>a*v,1);
		let rightDiffLength = rightDiffFactor.varNumStates.reduce((a,v)=>a*v,1);
		let diffLength = leftDiffLength*rightDiffLength;
		
		let vars = [...commonFactor.vars, ...leftDiffFactor.vars, ...rightDiffFactor.vars];
		let varNumStates = [...commonFactor.varNumStates, ...leftDiffFactor.varNumStates, ...rightDiffFactor.varNumStates];
		let activeStates = [...commonFactor.activeStates, ...leftDiffFactor.activeStates, ...rightDiffFactor.activeStates];
		let values = new Float32Array(varNumStates.reduce((a,v)=>a*v,1));
		let conditionals = [...new Set(leftFactor.conditionals).difference(rightFactor.unconditionals).union(new Set(rightFactor.conditionals).difference(leftFactor.unconditionals))];
		
		let i=0, j=0, k=0, m=0;
		/// Array *might* be faster than Uint32Array (It's certainly not slower)
		let commonNumStates = Array.from(commonFactor.varNumStates);
		let leftDiffNumStates = Array.from(leftDiffFactor.varNumStates);
		let rightDiffNumStates = Array.from(rightDiffFactor.varNumStates);
		let commonIndexes = new Array(commonFactor.varNumStates.length).fill(0);
		let leftDiffIndexes = new Array(leftDiffFactor.varNumStates.length).fill(0);
		let rightDiffIndexes = new Array(rightDiffFactor.varNumStates.length).fill(0);
		/// Map the common state index for each v, to a position in leftFactor (or rightFactor) for that v
		let commonLeftPositions = commonFactor.vars.map(v => leftFactor.positions[leftFactor.vars.indexOf(v)] ?? 0);
		let commonRightPositions = commonFactor.vars.map(v => rightFactor.positions[rightFactor.vars.indexOf(v)] ?? 0);
		let leftDiffPositions = leftDiffFactor.vars.map(v => leftFactor.positions[leftFactor.vars.indexOf(v)] ?? 0);
		let rightDiffPositions = rightDiffFactor.vars.map(v => rightFactor.positions[rightFactor.vars.indexOf(v)] ?? 0);
		let commonLeftPartialPos = 0, commonRightPartialPos = 0, leftDiffPartialPos = 0, rightDiffPartialPos = 0;
		let commonGroup = 0, leftGroup = 0;
		let rdiLength = rightDiffIndexes.length-1, ldiLength = leftDiffIndexes.length-1, ciLength = commonIndexes.length-1;
		let leftDiffValues = new Float32Array(leftDiffLength);
		let rightDiffValues = new Float32Array(rightDiffLength);
		let leftFactorValues = leftFactor.values;
		let rightFactorValues = rightFactor.values;
		let identityMap = num => Array.from({length:num},(_,i)=>i);
		let leftIndexMap = commonFactor.activeStates.map((active,k) => {
			if (active==null)  return identityMap(commonFactor.varNumStates[k]);
			let j = leftFactor.vars.indexOf(commonFactor.vars[k]);
			return active.map((s,i) => {
				return leftFactor.activeStates[j]==null ? s : leftFactor.activeStates[j].indexOf(s);
			});
		});
		let rightIndexMap = commonFactor.activeStates.map((active,k) => {
			if (active==null)  return identityMap(commonFactor.varNumStates[k]);
			let j = rightFactor.vars.indexOf(commonFactor.vars[k]);
			return active.map((s,i) => {
				return rightFactor.activeStates[j]==null ? s : rightFactor.activeStates[j].indexOf(s);
			});
		});
		for (let k=0; k<commonIndexes.length; k++) {
			commonLeftPartialPos += leftIndexMap[k][0]*commonLeftPositions[k];
			commonRightPartialPos += rightIndexMap[k][0]*commonRightPositions[k];
		}
		/// Pre-computing these is a *teensy* bit faster (maybe ~10%, with ~80% win rate in 100 trials of 1000)
		let rightDiffPartialPosMap = new Array(rightDiffLength).fill(0);
		let leftDiffPartialPosMap = new Array(leftDiffLength).fill(0);
		// (_=>{
			for (k=0; k<rightDiffLength; k++) {
				rightDiffPartialPosMap[k] = rightDiffPartialPos;
				/// Manually inling this is way faster (and no stack use at all)
				for (m=rdiLength; m>=0; m--) {
					rightDiffIndexes[m]++;
					if (rightDiffIndexes[m] >= rightDiffNumStates[m]) {
						rightDiffPartialPos -= (rightDiffIndexes[m]-1)*rightDiffPositions[m];
						rightDiffIndexes[m] = 0;
					}
					else {
						rightDiffPartialPos += rightDiffPositions[m];
						break;
					}
				}
			}
			for (k=0; k<leftDiffLength; k++) {
				leftDiffPartialPosMap[k] = leftDiffPartialPos;
				for (m=ldiLength; m>=0; m--) {
					leftDiffIndexes[m]++;
					if (leftDiffIndexes[m] >= leftDiffNumStates[m]) {
						leftDiffPartialPos -= (leftDiffIndexes[m]-1)*leftDiffPositions[m];
						leftDiffIndexes[m] = 0;
					}
					else {
						leftDiffPartialPos += leftDiffPositions[m];
						break;
					}
				}
			}
		// })();
		// console.log(commonLeftPartialPos, commonRightPartialPos, commonFactor.activeStates);
		// debugger;
		for (i=0; i<commonLength; i++) {

			for (k=0; k<rightDiffLength; k++) {
				rightDiffValues[k] = rightFactorValues[commonRightPartialPos + rightDiffPartialPosMap[k]];
			}

			for (k=0; k<leftDiffLength; k++) {
				leftDiffValues[k] = leftFactorValues[commonLeftPartialPos + leftDiffPartialPosMap[k]];
				/// Manually inling this is way faster (and no stack use at all)
			}

			commonGroup = i*diffLength;
			for (j=0; j<leftDiffLength; j++) {
				/// Convert each the indexes into
				leftGroup = j*rightDiffLength;
				/// This is the hottest part of this function
				for (k=0; k<rightDiffLength; k++) {
					values[commonGroup + leftGroup + k] = leftDiffValues[j] * rightDiffValues[k];
				}
			}
			
			for (k=ciLength; k>=0; k--) {
				m = ++commonIndexes[k];
				if (commonIndexes[k] >= commonNumStates[k]) {
					commonLeftPartialPos -= (leftIndexMap[k][m-1]-leftIndexMap[k][0])*commonLeftPositions[k];
					commonRightPartialPos -= (rightIndexMap[k][m-1]-rightIndexMap[k][0])*commonRightPositions[k];
					commonIndexes[k] = 0;
				}
				else {
					commonLeftPartialPos += (leftIndexMap[k][m]-leftIndexMap[k][m-1])*commonLeftPositions[k];
					commonRightPartialPos += (rightIndexMap[k][m]-rightIndexMap[k][m-1])*commonRightPositions[k];
					break;
				}
			}
		}
		
		newFactor.make(vars, varNumStates, values, conditionals, activeStates);
		
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
		
		let values = new Float32Array(newNumStates);
		
		let thisIndex = new Uint32Array(this.vars.length);
		let newIndex = new Uint32Array(vars.length);
		
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
	
	marginalize1(id) {
		counters.marginalize1++;

		let factor = new Factor();
		
		let varNumStates = [];
		let numMarginalStates = 0;
		let activeStates = [];
		let jump = 1;
		let vars = this.vars.filter((v,i) => {
			let include = v != id;
			if (include) {
				varNumStates.push(this.varNumStates[i]);
				activeStates.push(this.activeStates[i]==null ? this.activeStates[i] : this.activeStates[i].slice());
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
		let conditionals = this.conditionals.slice();
		
		let values = new Float32Array(newNumStates);
		
		let i = 0, j = 0, group = 0;
		let iter = 0;
		let valueI = 0;
		let vl = values.length, oldVals = this.values;
		for (i=0; i<vl; i++) {
			group = Math.floor(i/jump)*(numMarginalStates*jump) + i%jump;
			for (j=0; j<numMarginalStates; j++) {
				values[i] += oldVals[group + j*jump];
			}
		}
		
		factor.make(vars, varNumStates, values, conditionals, activeStates);
		
		return factor;
	}
	
	marginalizeToSingle(id) {
		counters.marginalizeToSingle++;

		let factor = new Factor();
		let varPos = this.vars.indexOf(id);
		
		let vars = [id];
		let varNumStates = [this.varNumStates[varPos]];
		let numStates = varNumStates[0];
		let values = new Float32Array(numStates);
		let activeStates = [this.activeStates[varPos]];
		let conditionals = this.conditionals.slice();
		let numMarginalStates = 0;
		let jump = 1;
		
		let oldValues = this.values;
		let oldValuesLength = oldValues.length;
		let oldVarPos = this.positions[varPos];
		let oldI = 0, newI = 0;
		for (oldI=0; oldI<oldValuesLength; oldI++) {
			newI = Math.floor(oldI/oldVarPos) % numStates;
			values[newI] += oldValues[oldI];
		}
		
		factor.make(vars, varNumStates, values, conditionals, activeStates);
		
		return factor;
	}
	
	/// This will multiply n factors at once
	multiplyFaster5(otherFactors) {
		let allFactors = [this,...otherFactors];
	}
	/// This will multiply n factors and marginalize m variables at the same time
	/// This should, hopefully, be the fastest and last version!
	/// (Not counting operations that start to exploit independence.)
	multiplyAndMarginalize2(otherFactors, ids) {
		
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
		counters.multiplyAndMarginalize++;
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
			factorIndexMap.push(new Uint32Array(factorVars.length));
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
		let mulIndex = new Uint32Array(vars.length);
		
		/// Set up the output factor
		newFactor.make(finalVars, finalVarNumStates);
		let newFactorMap = new Uint32Array(finalVars.length);
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
	
	equals(otherFactor) {
		if (this==otherFactor)  return true;
		otherFactor = otherFactor.moveVarsToStart2(this.vars);
		return this.vars.length==otherFactor.vars.length
			&& this.values.length==otherFactor.values.length
			&& this.vars.reduce((a,v,i)=>v==otherFactor.vars[i] && a, true)
			&& this.varNumStates.reduce((a,v,i)=>v==otherFactor.varNumStates[i] && a, true)
			&& this.activeStates.reduce((a,v,i)=>(v==otherFactor.activeStates[i] || v.reduce((a2,v2,i2)=>v2==otherFactor.activeStates[i][i2] && a,true)) && a, true)
			&& this.values.reduce((a,v,i)=>v==otherFactor.values[i] && a, true);
	}
	
	toStringNodes() {
		return '#F'+this.factorNum+'('+this.getDomain().join(',')+')';
	}
	
	numberActiveStates() {
		return this.activeStates.reduce((a,v) => v!=null ? a+1 : a,0);
	}
	
	toStringShort() {
		let str = 'Factor(#'+this.factorNum+'; '+this.vars.join(',')+
			' as '+this.unconditionals.join(',')+(this.conditionals?('|'+this.conditionals.join(',')):'')+
			'; Active:'+this.activeStates.map(v => v==null?'_':v.join(':')).join(',')+
			'; Size:'+this.size()+
			'; ActiveCount:'+this.numberActiveStates()+')';
		return str;
	}
	
	toString() {
		let str = this.toStringShort()+':\n';
		let n = this.vars.length;
		this.makeIndexes();
		for (let i=0; i<this.values.length; i++) {
			str += this.indexes.slice(i*n, i*n+n).join('\t');
			str += '\t|\t' + sigFig(this.values[i],3)+'\n';
		}
		return str;
	}
	
	/// For .mb file format saving, predominantly
	getContent() {
		return this.funcText;
	}
	
	/// For testing
	static makeRandFactor(numVars, numStates = 2) {
		let factor = new Factor();
		
		factor.vars = Array.from({length:numVars}, (v,i) => String.fromCharCode(65+i));
		factor.varNumStates = Array.from({length:numVars}, (v,i) => numStates);
		factor.values = Float32Array.from({length:numStates**numVars}, _=>Math.floor(Math.random()*20));
		
		factor.make(factor.vars, factor.varNumStates, factor.values);
		
		return factor;
	}
	
	static makeTestFactor(numVars, numStates = 2) {
		let vars = Array.isArray(numVars) ? numVars : null;
		numVars = Array.isArray(numVars) ? numVars.length : numVars;
		let varNumStates = Array.isArray(numStates) ? numStates : new Array(numVars).fill(numStates);
		let factor = new Factor();
		
		vars = vars ?? Array.from({length:numVars}, (v,i) => String.fromCharCode(65+i));
		varNumStates = varNumStates.slice();
		let values = Float32Array.from({length:varNumStates.reduce((a,v)=>a*v,1)}, (_,i)=>(i+1));
		
		factor.make(vars, varNumStates, values);
		
		return factor;
	}
	
	static testMultiply() {
		// // No common factor
		// let f1 = Factor.makeTestFactor(['A']);
		// let f2 = Factor.makeTestFactor(['D']);
		// 2nd = evidence
		// let f1 = Factor.makeTestFactor(['A']); f1.values.set([0,1])
		// let f2 = Factor.makeTestFactor(['A']); f2.values.set([0,1]);
		// let f3 = Factor.makeTestFactor(['A']); f3.values.set([0.3,0.7]);
		// f1 = f1.select({A:1});
		// f2 = f2.select({A:1});
		// // // One common factor
		// // let f1 = Factor.makeTestFactor(['A']);
		// // let f2 = Factor.makeTestFactor(['A','D']);
		// // // Two common factors
		// // let f1 = Factor.makeTestFactor(['A','B','C']);
		// // let f2 = Factor.makeTestFactor(['A','E','C','F','D']);
		// // Larger factors
		// // let f1 = Factor.makeTestFactor(['A','B','C','D','E','G','K']);
		// // let f2 = Factor.makeTestFactor(['D','E','C','F','A','G','X','Y']);
		// // console.log(f1.toString());
		// // console.log(f2.toString());
		// // console.log('mf:', f1.multiplyFaster(f2).moveVarsToStart(['A','B','C']).toString());
		// // console.log('mf3:', f1.multiplyFaster3(f2).toString());
		// // console.log('mf4:', f1.multiplyFaster4(f2).toString());
		// // f1 = f1.select({A:1});
		// console.log('f1:', f1.toString());
		// console.log('f2:', f2.toString());
		// console.log('mf4_cond:', f1.multiplyFaster4(f2).multiplyFaster4(f3).toString());
		
		let f1j = JSON.parse('{"factorNum":117,"vars":["CBODD_12_15","CKNI_12_15"],"varNumStates":[1,3],"activeStates":[[2],null],"values":{"0":0.20110072195529938,"1":0.409842312335968,"2":0.1818510740995407},"conditionals":["CKNI_12_00"],"unconditionals":["CBODD_12_15","CKNI_12_15"],"_size":3}');
		let f2j = JSON.parse('{"factorNum":30,"vars":["CKNI_12_15","CBODD_12_15","CBODD_12_30"],"varNumStates":[3,4,4],"activeStates":[null,null,null],"values":{"0":0.9589062333106995,"1":0.04109375178813934,"2":0,"3":0,"4":0.03241562470793724,"5":0.9542562365531921,"6":0.013328124769032001,"7":0,"8":0,"9":0.07017968595027924,"10":0.9273421764373779,"11":0.002478125039488077,"12":0,"13":0,"14":0.11465000361204147,"15":0.8853499889373779,"16":0.8954437971115112,"17":0.10455624759197235,"18":0,"19":0,"20":0.008292187005281448,"21":0.9310718774795532,"22":0.06063593924045563,"23":0,"24":0,"25":0.025667186826467514,"26":0.9449312686920166,"27":0.029401563107967377,"28":0,"29":0,"30":0.0540640614926815,"31":0.9459359645843506,"32":0.8250750303268433,"33":0.17492499947547913,"34":0,"35":0,"36":0.001381249981932342,"37":0.8734655976295471,"38":0.12515312433242798,"39":0,"40":0,"41":0.007762500084936619,"42":0.9093124866485596,"43":0.08292499929666519,"44":0,"45":0,"46":0.02175937592983246,"47":0.9782406091690063},"conditionals":["CKNI_12_15","CBODD_12_15"],"unconditionals":["CBODD_12_30"],"_size":48,"keyNode":"CBODD_12_30","_isUnitPotential":false}');
		
		{
			let f1 = new Factor();
			let f2 = new Factor();
			f1.make(f1j.vars, f1j.varNumStates, [...Object.values(f1j.values)/*.map((_,i)=>i+1)*/], f1j.conditionals, f1j.activeStates);
			f2.make(f2j.vars, f2j.varNumStates, [...Object.values(f2j.values)/*.map((_,i)=>i+1)*/], f2j.conditionals, f2j.activeStates);
			
			let res1 = f1.multiplyFaster4(f2);
			console.log(f1.toString());
			console.log(f2.toString());
			console.log(res1.toString());
		}

		// let iters = 10000;
		// // console.time('sep');
		// // for (let i=0;i<iters;i++) {  f1.multiplyFaster(f2);  }
		// // console.timeEnd('sep');
		// console.time('mul3');
		// for (let i=0;i<iters;i++) {  f1.multiplyFaster3(f2);  }
		// console.timeEnd('mul3');
		// console.time('mul4');
		// for (let i=0;i<iters;i++) {  f1.multiplyFaster4(f2);  }
		// console.timeEnd('mul4');
		// console.time('mul3');
		// for (let i=0;i<iters;i++) {  f1.multiplyFaster3(f2);  }
		// console.timeEnd('mul3');
		// console.time('mul4');
		// for (let i=0;i<iters;i++) {  f1.multiplyFaster4(f2);  }
		// console.timeEnd('mul4');
		
		// let f1 = Factor.makeTestFactor(['K','L','A','B','C','F','D']);
		// console.log(f1.toString());
		// let f1a = f1.moveVarsToStart2(['A','B']);
		// console.log(f1a.toString());
		// let f1b = f1.moveVarToStart('B').moveVarToStart('A');
		// console.log(f1b.toString());

		// let iters = 10000;
		// console.time('sep');
		// for (let i=0;i<iters;i++) {  f1.moveVarToStart('C').moveVarToStart('B').moveVarToStart('A');  }
		// console.timeEnd('sep');
		// console.time('sep2');
		// for (let i=0;i<iters;i++) {  f1.moveVarsToStart2(['A','B','C']);  }
		// console.timeEnd('sep2');
		
		
		/*let f = new Factor();
		console.time('makeFac');
		f.make("a b c d e f g h i j k l".split(/ /), new Array(12).fill(4));
		console.log('Size:', f.size());
		console.timeEnd('makeFac');*/
		//console.log(f.toString());
		
		// for (let testVars of [['A','B'],['A','B','C']]) {
			// for (let testVars2 of [['A','B'],['B','A'],['A'],['B','C'],['B','C','D'],['D','E','C','A']]) {
				// let f1 = Factor.makeTestFactor(testVars);
				// let f2 = Factor.makeTestFactor(testVars2);
				// f1.calcPositions(); f2.calcPositions();
				// console.log('mf:',f1.toString(), f2.toString(), f1.multiplyFaster(f2).moveVarsToStart2(testVars2).moveVarsToStart2(testVars).toString());
				// console.log('mf3:',f1.toString(), f2.toString(), f1.multiplyFaster3(f2).toString());
			// }
		// }
		
		// for (let t=0; t<10; t++) {
			// let f1 = Factor.makeTestFactor(Math.floor(Math.random()*4+2));
			// let f2Vars = [...new Set(Array.from({length:Math.floor(Math.random()*6+2)}, _=>String.fromCharCode(Math.floor(Math.random()*26+65))))];
			// let f2 = Factor.makeTestFactor(f2Vars);
			// let res1 = f1.multiplyFaster(f2);
			// let res2 = f1.multiplyFaster3(f2);
			// console.log(f1.vars, f2.vars);
			// console.time('sep');
			// for (let i=0;i<iters;i++) {  f1.multiplyFaster(f2)  }
			// console.timeEnd('sep');
			// console.time('sep2');
			// for (let i=0;i<iters;i++) {  f1.multiplyFaster2(f2)  }
			// console.timeEnd('sep2');
			// // console.log('Orig:',res2.vars);
			// res2.vars.toReversed().forEach(v => { res1 = res1.moveVarToStart(v); /*console.log(res1.vars);*/ });
			// // console.log(res1.toString());
			// // console.log(res2.toString());
			// console.log('try',t);
			// if (!res1.values.reduce((a,v,i)=>a && v==res2.values[i], true)) {
				// console.log(f1.toString());
				// console.log(f2.toString());
				// console.log(res1.toString());
				// console.log(res2.toString());
				// break;
			// }
		// }

		// let iters = 1000;
		// let f1 = Factor.makeTestFactor(['A','B','C']);
		// let f2 = Factor.makeTestFactor(['D','E','C','A']);
		// f1 = Factor.makeTestFactor(['K','L','A','B','C','F','D']);
		// f2 = Factor.makeTestFactor(['D','E','C','A']);
		// f1 = Factor.makeTestFactor(['B']);
		// f2 = Factor.makeTestFactor(['R','G','F']);
		// // f1.calcPositions(); f2.calcPositions();
		// // console.time('sep');
		// // for (let i=0;i<iters;i++) {  f1.multiplyFaster(f2)  }
		// // console.timeEnd('sep');
		// // console.time('sep2');
		// // for (let i=0;i<iters;i++) {  f1.multiplyFaster2(f2)  }
		// // console.timeEnd('sep2');
		// console.log(f1.multiplyFaster2(f2).toString());
		
		// for (let t=0; t<10; t++) {
			// let f1 = Factor.makeTestFactor(Math.floor(Math.random()*4+2));
			// let f2Vars = [...new Set(Array.from({length:Math.floor(Math.random()*6+2)}, _=>String.fromCharCode(Math.floor(Math.random()*26+65))))];
			// let f2 = Factor.makeTestFactor(f2Vars);
			// let res1 = f1.multiplyFaster(f2);
			// let res2 = f1.multiplyFaster2(f2);
			// console.log(f1.vars, f2.vars);
			// console.time('sep');
			// for (let i=0;i<iters;i++) {  f1.multiplyFaster(f2)  }
			// console.timeEnd('sep');
			// console.time('sep2');
			// for (let i=0;i<iters;i++) {  f1.multiplyFaster2(f2)  }
			// console.timeEnd('sep2');
			// // console.log('Orig:',res2.vars);
			// res2.vars.toReversed().forEach(v => { res1 = res1.moveVarToStart(v); /*console.log(res1.vars);*/ });
			// // console.log(res1.toString());
			// // console.log(res2.toString());
			// console.log('try',t);
			// if (!res1.values.reduce((a,v,i)=>a && v==res2.values[i], true)) {
				// console.log(f1.toString());
				// console.log(f2.toString());
				// console.log(res1.toString());
				// console.log(res2.toString());
				// break;
			// }
		// }

		
		/*
		
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
		// console.log('Combined:', Factor.multiplyAndMarginalize([f1,f2], ['a','b','d'], true).toString());
		console.log('Combined2:', Factor.multiplyAndMarginalize([f1,f2], []).toString());
		console.log('New multiply:', f1.multiplyFaster(f2).toString());
		console.log('New multiply2:', f1.multiplyFaster2(f2).toString());*/

		// console.log('Separate:', f1.multiply(f2).marginalize1('b').toString());
		// console.log('Combined:', Factor.multiplyAndMarginalize([f1,f2], ['a','d'], true).toString());
		// console.log('Combined2:', Factor.multiplyAndMarginalize([f1,f2], ['b']).toString());
		// console.log('New multiply:', f1.multiplyFaster(f2).marginalize1('b').toString());

		// console.log('Separate:', f1.multiply(f2).multiply(f2).marginalize1('b').marginalize1('d').toString());
		// console.log('Combined:', Factor.multiplyAndMarginalize([f1,f2,f2], ['a'], true).toString());
		// console.log('Combined2:', Factor.multiplyAndMarginalize([f1,f2,f2], ['b','d']).toString());
		// console.log('New multiply:', f1.multiplyFaster(f2).multiplyFaster(f2).marginalize1('b').marginalize1('d').toString());

		// console.time('sep2');
		// for (let i=0;i<100000;i++) {  f1.multiplyFaster(f2).multiplyFaster(f2)  }
		// console.timeEnd('sep2');
		// console.time('sep');
		// for (let i=0;i<100000;i++) {  f1.multiply(f2).multiply(f2)  }
		// console.timeEnd('sep');

		// let f4 = new Factor().make(['a','b','c'], [2,2,3], new Array(12).fill(0).map(_=>Math.round(Math.random()*100)/100));
		// console.log('M:', f4.marginalize('b').toString());
		// console.log('M:', f4.marginalize1('b').toString());
		
		// console.log('move orig:', f4.toString());
		// console.log('move c:', f4.moveVarToStart('c').toString());
		// console.log('move b:', f4.moveVarToStart('b').toString());
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