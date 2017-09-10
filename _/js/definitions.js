var CASE_STATE = 0;
var CASE_REAL_VALUE = 1;

var Sampling = class {
	constructor(o = {}) {
		this.evidence = null;
		this.weight = 1;
		this.case = null;
		this.caseReal = null;
		this.caseTypes = null;
		
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
		if (this.node && this.node.net)  this.node.net.needsCompile = true;
	}
	get needsCompile() { return this._needsCompile; }
}

var CPT = class extends Definition {
	constructor(node, cpt) {
		super();
		this.type = "CPT";
		this.node = node;
		this.cpt = cpt;
		this.needsCompile = true;
		if (node && node.fromDef) { var def = node; this.fromDef(def); }
		else if (this.node && !this.cpt)  this.setInitial();
	}
	
	duplicate(o) {
		return Object.assign(new CPT(), this, {
			cpt: this.cpt.slice(),
		}, o);
	}
	
	fromDef(def) {
		this.node = def.node;
		this.cpt = new Float32Array(new ArrayBuffer(this.node.numParentCombinations()*this.node.states.length*4));
		if (def.type == 'CDT') {
			for (var i=0; i<def.funcTable.length; i++) {
				this.cpt[this.node.states.length*i + def.funcTable[i]] = 1;
			}
		}
		else if (def.type == 'Equation') {
			this.setInitial();
		}
	}
	
	compile(o = {}) {
		o.force = o.force || false;
		//var node = this.node;
		if (o.force || this.needsCompile) {
			var cptBuf = new ArrayBuffer(this.cpt.length*4);
			var newCpt = new Float32Array(cptBuf);
			for (var i=0; i<this.cpt.length; i++) {
				newCpt[i] = this.cpt[i];
			}
			this.cpt = newCpt;
			this.needsCompile = false;
		}
		
		return this;
	}
	
	/// XXX I need to actually make this work!
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

			/// Calculate likelihood of evidence
			var likelihood = this.cpt[rowI*node.states.length + cas[node.intId]];
			sampling.weight *= likelihood;
		}
		else {
			/// Generate state for node
			var stateProbs = this.cpt;

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
					break;
				}
			}
		}
	}
	
	setInitial() {
		this.setUniform();
		return this;
	}
	
	setUniform() {
		this.cpt = new Float32Array(new ArrayBuffer(this.node.numParentCombinations()*this.node.states.length*4));
		for (var i=0; i<this.cpt.length; i++)  this.cpt[i] = 1/this.node.states.length;

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
		this.normalizeCpt();
		
		return this;
	}
	
	normalize() {
		for (var i=0; i<this.cpt.length; i+=this.node.states.length) {
			var sum = 0;
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
		}
		
		return this;
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
	updateStates({oldNumStates, newNumStates, insertPoint, insertedI, removedI, fromStateI, toStateI}) {
		/// XXX Need to integrate insertions and removals properly
		if (insertPoint) {
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
		else if (removedI) {
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
		else if (fromStateI && toStateI) {
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
			/// Get cpt row from old child
			var row = oldNode.def.getNamedLookupRow(curParentStates);
			if (row !== null) {
				console.log("row:", row);
				/// If array of arrays, take average
				/// (This is short, but illegible. I'll allow it.)
				if (row[0].length)  row = row.reduce((a,b) => a.map((_,i) => a[i]+b[i])).map(a=>a/row.length);
				/// Set cpt row in new child (if invalid states, will fail silently)
				console.log("setting:", curParentStates, row);
				this.setNamedLookupRow(curParentStates, row);
			}
			else {
				this.setNamedLookupRow(curParentStates,
					new Array(this.node.states.length).fill(1/this.node.states.length)
				);
			}
		} while (nextCombination(this.node.parents, parentIndexes));
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
	constructor(node, funcTable) {
		super();
		this.type = "CDT";
		this.node = node;
		this.funcTable = funcTable;
		this.needsCompile = true;
		if (node && node.fromDef) { var def = node; this.fromDef(def); }
		else if (this.node && !this.funcTable)  this.setInitial();
	}
	
	duplicate(o) {
		return Object.assign(new CDT(), this, {
			funcTable: this.funcTable.slice(),
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
	
	compile(o = {}) {
		o.force = o.force || false;
		var node = this;
		if (o.force || this.needsCompile) {
			var ftBuf = new ArrayBuffer(this.funcTable.length*4);
			var newFt = new Int32Array(ftBuf);
			for (var i=0; i<this.funcTable.length; i++) {
				newFt[i] = this.funcTable[i];
			}
			this.funcTable = newFt;
			this.needsCompile = false;
		}
		return this;
	}
	
	/// XXX I need to actually make this work!
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
			sampling.weight *= (this.funcTable[rowI] == cas[node.intId] ? 1 : 0);
		}
		else {
			/// Get the deterministic state
			cas[node.intId] = this.funcTable[rowI];
		}
	}
	
	setInitial() {
		this.funcTable = new Int32Array(new ArrayBuffer(this.node.numParentCombinations()*4));
		this.needsCompile = true;
		return this;
	}
	
	/**
	This gets the i'th row in the CPT, if this node
	has one of those. If i is an array, gets row for all i's in the array.
	These functions return null if no valid row.
	*/
	getRow(i) {
		/// If array, return array
		if (i.length && i.map)  return i.map(v=>this.getRow(v));
		if (i<0 || i>this.funcTable.length)  return null;
		return this.funcTable[i];
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
	constructor(node, funcText) {
		super();
		this.type = "Equation";
		this.node = node;
		this.funcText = funcText;
		this.funcDef = null;
		this.needsCompile = true;
		if (node && node.fromDef) { var def = node; this.fromDef(def); }
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
				console.log(pars, bodyDef);
				bodyDef = bodyDef.replace(new RegExp('\\b'+pars[p]+'\\b', 'g'), '__pars['+p+']');
				console.log(pars, bodyDef);
			}
		}
		return [
			'__pars',
			'return '+bodyDef
		];
	}
	
	compile(o = {}) {
		o.force = o.force || false;
		if (o.force || this.needsCompile) {
			this.funcDef = Equation.parse(this.node.id, this.node.parents.map(p=>p.id), this.funcText);
			this.func = new Function(...this.funcDef);
			this.needsCompile = false;
			this.parentStates = new Float32Array(new ArrayBuffer(4*this.node.parents.length));
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

		/// Evidence not supported yet!
		/*if (evidence[node.intId] != -1) {

		}
		else {
			/// Generate value for node
			var parents = node.parents;
			for (var pi=0; pi<parents.length; pi++) {
				node.parentStates[pi] = cas[parents[pi].intId];
			}
			cas[node.intId] = this.func(node.parentStates);
			//onsole.log(_node.parentStates, cas);
		}*/

		if (evidence[node.intId] == -1) {
			/// Generate value for node
			var parents = node.parents;
			for (var pi=0; pi<parents.length; pi++) {
				var casType = caseTypes[parents[pi].intId];
				//onsole.log(this.parentStates, cas);			
				if (casType == CASE_REAL_VALUE) {
					//onsole.log(this.parentStates, cas);			
					this.parentStates[pi] = caseReal[parents[pi].intId];
				}
				else {
					//onsole.log('xxxxxxxxx',casType,this.parentStates, cas);			
					this.parentStates[pi] = cas[parents[pi].intId];
				}
			}
			/// Save real and integer version of output
			//onsole.log(this.parentStates, cas);			
			caseReal[node.intId] = this.func(this.parentStates);
			cas[node.intId] = caseReal[node.intId];
		}
		/// Evidence not supported yet!
		else if (evidence[node.intId] != -1) {

		}
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

var NodeDefinitions = {
	CPT, CDT, Equation
};

function duplicate(obj, props) {
	return Object.assign(Object.create(obj.constructor.prototype), props);
}