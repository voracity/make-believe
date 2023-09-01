/** This whole section needs to change **/
var mbConfig = {
	updateMethod: 'autoSelect',
	useWorkers: false,
	// updateMethod: 'likelihoodWeighting',
	// useWorkers: true,
	updateMethod: 'junctionTree',
	useWorkers: true,
	numWorkers: 2,
	iterations: 10000,
};
var FILE_EXTENSIONS = {
	mb: {text: true},
	xdsl: {text: true},
	dne: {text: true},
	cmp: {text: false},
};
function getFileType(fileName) {
	let format = fileName.replace(/^.*\.([^.]*)$/, '$1');
	/// Assume xdsl if extension not recognised (XXX probably should at least throw a warning before
	/// the inevitable failure to load anything)
	console.log(format);
	if (!FILE_EXTENSIONS[format]) {
		format = "xdsl";
	}
	return format;
}
function getFileTypeInfo(format) {
	let fileExtInfo = FILE_EXTENSIONS[format];
	return fileExtInfo;
}

/// Cloning/duplication/etc.
function copyTo(from, to, o = {}) {
	o.existingOnly ??= false;
	let objs = new Map();
	let _copyTo = (from,to) =>{
		objs.set(from,to);
		for (let [k,v] of Object.entries(from)) {
			if (o.existingOnly && !(k in to))  continue;
			/// Never duplicate HTML elements
			if ((typeof(v)!='object' || v==null) || v instanceof HTMLElement) {
				to[k] = v;
			}
			else {
				if (objs.has(v)) {
					to[k] = objs.get(v);
				}
				else {
					if (typeof(to[k])!='object' || to[k]==null)  to[k] = {};
					_copyTo(v, to[k]);
				}
			}
		}
	};
	_copyTo(from,to);
	return to;
}
/// From https://developer.mozilla.org/en-US/docs/Web/Guide/API/DOM/The_structured_clone_algorithm
function clone(objectToBeCloned) {
  // Basis.
  if (!(objectToBeCloned instanceof Object)) {
	return objectToBeCloned;
  }

  var objectClone;

  // Filter out special objects.
  var Constructor = objectToBeCloned.constructor;
  switch (Constructor) {
	// Implement other special objects here.
	case RegExp:
	  objectClone = new Constructor(objectToBeCloned);
	  break;
	case Date:
	  objectClone = new Constructor(objectToBeCloned.getTime());
	  break;
	default:
	  objectClone = new Constructor();
  }

  // Clone each property.
  for (var prop in objectToBeCloned) {
	objectClone[prop] = clone(objectToBeCloned[prop]);
  }

  return objectClone;
}

if (typeof($)=="undefined") {
	/// XXX Quick hack to suppress ordinary console.logs in the API
	/// XXX Fix by actually removing unnecessary console.log statements!
	console.apilog = console.log;
	console.log = function(){}

	$ = require('cheerio');
	/*** Am using Object.assign now
	/// I use jQuery's extend, add something like it
	$.extend = function() {
		var newObj = {};
		for (var i=0; i<arguments.length; i++) {
			var nextObj = arguments[i];
			for (var k in nextObj) {
				newObj[k] = nextObj[k];
			}
		}
		return newObj;
	}
	***/
	bu = require('./beliefUpdate_worker.js');
	({addObjectLinks} = require('./objectlinks.js'));
	({CPT, CDT, Equation, NodeDefinitions} = require('./definitions.js'));
	({JunctionTree} = require('./junctionTree_worker.js'));
	({makeBnForUpdates} = require('./engineCommon.js'));

	function genPass(length) {
		var pwd;
		pwd = "";
		for (i=0;i<length;i++) {
			pwd += String.fromCharCode(Math.floor((Math.random()*25+65)));
		}
		return pwd.toLowerCase();
	}
	mbConfig.useWorkers = false;
}

var titlePostfix = typeof(document)!="undefined" ? document.title : ""; /// Valid on load, but not any other time of course

/// Adds a default |setXXX| function for every property in the object,
/// unless one is already specified in the chain. This should be called
/// on the constructor (i.e. addDefaultSetters(Object)) as well as
/// *inside* the constructor at the end of property initialisations
/// (i.e. addDefaultSetters(this)).
///
/// For addDefaultSetters(Object), it will create
/// an object (that's empty), and assigned setters to the prototype based on that.
/// However, the constructor might set things up differently in a given circumstance,
/// so it's often required to addDefaultSetters(this) as well.
function addDefaultSetters(Obj) {
	var o = Obj;
	var proto = o.__proto__;
	var assignTo = o;
	if (typeof(Obj)=="function") {
		o = new Obj({__noinit:true});
		proto = Obj.prototype;
		assignTo = proto;
	}
	for (var i in o) { (function(i){
		if (!(i in proto)) {
			var setterName = 'set'+i[0].toUpperCase()+i.slice(1);
			if (!(setterName in assignTo)) {
				Object.defineProperty(assignTo, setterName, {
					configurable:true,writable:true,enumerable:false,value: function(val) {
					this[i] = val;
					return this;
				}
				});
			}
		}
	})(i); }
}

// Not such a good idea, given no way to distinguish length and methods like filter, etc.
// /// Add a property to an array, and make sure it isn't enumerable
// function setArrayProperty(obj, prop, value) {
	// Object.defineProperty(obj, prop, {configurable:true, writable:true, enumerable: false, value});
// }

/// I'm not sure if this guarantees a nicely formatted string.
function sigFig(num, digits) {
	if (num==0)  return 0;
	/// Get a multiplier based on the log position of most sig digit (add 1 to avoid 100...0 not being rounded up)
	var mul = Math.pow(10,Math.floor(Math.log10(num)));
	var sigPow = Math.pow(10,digits-1);
	/// XXX: I need to work this out properly at some point
	var v = Math.round((num/mul)*sigPow);
	if ((mul/sigPow) < 1) {
		var d = Math.round(1/(mul/sigPow));
		v = v/d;
	}
	else {
		var d = Math.round(mul/sigPow);
		v = v*d;
	}

	return v;
}

function toChance(v) {
	if (v>0 && v<1) {
		return String(v).substr(1);
	}
	if (v == 0 || v == 1) {
		return String(v);
	}
	return "x";
}

function toPercent(num, dp, fromPercentNum) {
	if (!dp) { dp = 0; }
	var mul = Math.pow(10, dp);
	if (isNaN(num) && num.search(/%/)!=-1) {
		return num;
	}
	else if (!fromPercentNum) {
		return Math.round(num*100*mul)/mul + "%";
	}
	else {
		return Math.round(num*mul)/mul + "%";
	}
}

function toHtml(str) {
	if (str===null || str===undefined)  return "";
	str = ""+str;
	str = str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
	return str;
}

/**
	Normalise a pseudo-probability vector to a probability vector.
*/
function normalize(vec) {
	var sum = 0;
	for (var i=0; i<vec.length; i++)  if (vec[i]>0)  sum += vec[i];

	var newVec = new Array(vec.length);
	if (sum>0) {
		for (var i=0; i<vec.length; i++)  newVec[i] = vec[i]>0 ? vec[i]/sum : 0;
	}
	else {
		for (var i=0; i<vec.length; i++)  newVec[i] = 1/vec.length;
	}

	return newVec;
}

function klDiv(distro1, distro2) {
	if (distro1.length != distro2.length)  return 0;

	var sum = 0;
	for (var i=0; i<distro1.length; i++) {
		if (distro1[i]!=0) {
			sum += distro1[i] * Math.log(distro1[i]/distro2[i]);
		}
	}

	return sum;
}

String.prototype._splitNotEmpty = function() {
	return this.length==0 ? [] : this.split.apply(this, arguments);
}

function baseName(fileName) {
	var m = fileName.match(/[^/]*$/);
	if (m) {
		return m[0];
	}
	return null;
}

/// Create a new JS array of the given |size|, with all entries set to the |initial| value
function newArray(size, initial) {
	var arr = new Array(size);

	for (var i=0; i<size; i++) {
		arr[i] = clone(initial);
	}

	return arr;
}

/// Overwrite each value in the |arr| array with the value |initial|
function renewArray(arr, initial) {
	var size = arr.length;

	for (var i=0; i<size; i++) {
		arr[i] = clone(initial);
	}

	return arr;
}

/// The |initialStates| and |nextStates| functions can be used together
/// to step through every row in a CPT, with indexes pointing back to each parent state.
/// Run |initialStates| on the list of parent nodes, to initialise an array of state indexes,
/// and then use |nextStates| in a loop to iterate through each valid combination of
/// parent states. |nextStates| returns true so long as there are more combinations
/// to visit before returning to the initial combination of states.
function initialStates(nodes) {
	return newArray(nodes.length, 0);
}

function nextStates(nodes, states) {
	for (var j=nodes.length-1; j>=0; j--) {
		states[j]++;
		if (states[j] < nodes[j].states.length)  break;
		else                                      states[j] = 0;
	}
	return j >= 0;
}

//var IDREGEX = /([_a-zA-Z])([_0-9a-zA-Z]{0,29})/; /// NOTE: Not anchored at start,end
var IDREGEX = /([_a-zA-Z])([_0-9a-zA-Z]*)/; /// NOTE: Not anchored at start,end
function makeValidId(str) {
	try {
		return str.replace(/[^_0-9a-zA-Z]/g, '_').replace(/^[^_a-zA-Z]/, '_$&'); //.substr(0, 30);
	} catch(e) { return null; }
}

/**
   A State is associated with discrete nodes, and defines an id for the state,
   as well it's index in the order. The index may take on more significance in
   future, once I add support for ordinal nodes in some way. Other elements may
   also be added to state in future (like, for example, values and intervals).
**/
var State = class {
	constructor(o = {}) {
		/// The state's ID (as per GeNIe)
		this.id = null;
		/// An optional label for the state
		this.label = null;
		/// The state's index in the node state list
		this.index = null;
		/// An optional value for the state
		this.value = null;
		/// An optional minimum/maximum, if this state specifies a range
		this.minimum = null;
		this.maximum = null;

		/// Set options based on constructor args
		for (var i in o) {
			this[i] = o[i];
		}
		addDefaultSetters(this);
		addObjectLinks(this);
	}
}

/// DisplayItem MIXIN
function DisplayItem(o = {}) {
	this.pos = {x: 0, y: 0};
	this.size = {width: null, height: null};
	/// Formatting (all at their defaults)
	this.format = {
		backgroundColor: null,
		borderColor: null,
		fontColor: null,
		fontFamily: null,
		fontSize: null,
		/// A displayStyle is how the item will be displayed (e.g. via CSS), but doesn't
		/// change what gets written to canvas (e.g. unlike `view`, once that's working).
		displayStyle: null,
	};

	/// A view is a custom way of displaying this item on canvas that will be called instead of
	/// the default method.
	/// This should be function of the form displayItem => html.
	this.view = null;

	Object.assign(this, o);
}
DisplayItem.prototype = {
	moveTo(x, y) {
		this.pos.x = x;
		this.pos.y = y;
	},
	
	isGraphItem() {
		/// XXX Not sure this is best way to detect whether we're working with
		/// a graph item.
		return Boolean(this.parents || this.subNodes);
	},
	
	/// This only works for graph items
	/// This will remove path entries in *other* items only (not this item)
	cleanPathsInOut() {
		for (let pathIn of this.pathsIn) {
			let i = pathIn.parentItem.pathsOut.findIndex(p => p.childItem.id == this.id);
			pathIn.parentItem.pathsOut.splice(i,1);
		}
		for (let pathOut of this.pathsOut) {
			let i = pathOut.childItem.pathsIn.findIndex(p => p.parentItem.id == this.id);
			pathOut.childItem.pathsIn.splice(i,1);
		}
	},
	
	removePathRefs(item) {
		/// Can't be in/out multiple times.
		for (let itemListType of ['pathsIn','pathsOut']) {
			let itemType = itemListType == 'pathsIn' ? 'parentItem' : 'childItem';
			let index = this[itemListType].findIndex(p => p[itemType].id == item.id);
			if (index !== -1)  this[itemListType].splice(index, 1);
		}
	},
};

/// Adds mix-in to a classObj/constructor AND updates prototype
function addMixin(classObj, mixin) {
	Object.assign(classObj.prototype, mixin.prototype);
	return (thisObj, ...args) => mixin.apply(thisObj, args);
}

/** To create a node, call new Node({opt1:...,opt2:...}) **/
var Node = class {
	static DisplayItem = addMixin(this, DisplayItem);
	constructor(o = {}) {
		/*
			Member vars and their defaults
		*/
		this._type = "Node";
		/// Every node receives a unique key (that should not be altered by
		/// the user, lest they want things to go awry!)
		Object.defineProperty(this, '_key', {value: genPass(10)});
		/// The net to which the node belongs
		this.net = null;
		/// The node's ID (as per GeNIe)
		this.id = null;
		/// The node's label (equivalent to Netica's 'title', or GeNIe's 'name')
		this.label = null;
		/// Type of node: nature, decision, utility
		this.type = "nature";
		this.stateSpace = {
			/// The type of the state space: categorical, ordered, point, interval or continuous
			/// The first 4 are discrete, the last continuous (of course)
			type: "categorical",
			/// For continuous nodes, whether we also have a discretized set of states
			discretized: false,
			/// If discretized continuous, is the discretization just for children
			forChildrenOnly: false,
		};
		/// A list of states (state objects {id: _, index: _}) XXX
		this.states = [];
		/// A map of state ids -> position in states array
		this.statesById = {};
		/// Pointers to the parents of this node
		this.parents = [];
		/// Cache of parent state values
		this.parentStates = [];
		/// Pointers to the children of this node
		this.children = [];
		/// The def defines (appropriately enough) how this node interacts
		/// with the rest of the network, and to some extent the user.
		this.def = null;
		/// The values (potentially utilities) associated with this node's states (TO REMOVE)
		this.values = [];
		/// The current beliefs for this node (net must have been updated separately)
		this.beliefs = null;
		/// 'counts' (per state) and 'seen' (for the whole node) are generated
		/// during simulation belief update. A little bit
		/// like 'experience' in Netica, but not really.
		this.counts = null;
		this.seen = 0;
		/// 'samples' are for continuous nodes, and are a list of all the samples
		/// created for this node.
		/// Coupled with the samples, are the sample weights, which is the weight
		/// of the case in which the sample was generated
		this.samples = [];
		this.sampleWeights = [];
		/// In a DBN, the time-dependent version of the CPT/funcTable (e.g. t=0, t=1, etc. within a CPT in GeNIe)
		this.dbnOrder = 0;
		/// In a DBN, what temporal step this node falls into
		this.slice = 0;
		/// Whether this node is a dynamic node
		this.dynamic = false;
		/// Parents of nodes in slices t>0. Each parent should be specified as [<parent>,<order>]
		this.dynamicParents = [];
		/// Whether this node should be visible to the engine only, and not the user
		this.engineOnly = false;
		/// The path (left-to-right array) through the submodels to this node. An empty array means the node
		/// is in the root model.
		this.submodelPath = [];
		/// A comment or description describing or documenting the node
		this.comment = "";
		
		/// Does the display need updating?
		this._updateDisplay = false;

		/// For arc drawing/updating
		this.pathsIn = [];
		this.pathsOut = [];

		/// Visual properties
		this.constructor.DisplayItem(this, {size: {width: 110, height: 50}});

		/// Set options based on constructor args
		Object.assign(this, o);
		/// These specific properties are copied, everything else has its pointer saved
		this.parents = this.parents.slice();
		this.children = this.children.slice();
		this.submodelPath = this.submodelPath.slice();
		/// These are more convenient ways of setting the definitions
		if (this.cpt) {
			this.def = new CPT(this, this.cpt);
			delete this.cpt;
		}
		else if (this.cdt || this.funcTable) {
			this.def = new CDT(this, this.cdt || this.funcTable);
			delete this.cdt;
			delete this.funcTable;
		}
		else if (this.equation || this.funcText) {
			this.def = new Equation(this, this.equation || this.funcText);
			delete this.equation;
			delete this.funcText;
		}
		/// This could be expensive in some marginal cases
		else if (this.def) {
			this.def = this.def.duplicate({node: this});
		}

		addDefaultSetters(this);
		addObjectLinks(this);
		// if (!o.__noinit && new.target)  this.init({addToCanvas: o.addToCanvas, submodelPath: o.submodelPath});
		if (!o.__noinit)  this.init({addToCanvas: o.addToCanvas, submodelPath: o.submodelPath});
	}
	
	get state() {
		return this.statesById;
	}	
}
Node.__fieldCopyTypes = {parents: 'shallow', children: 'shallow', submodelPath: 'deep'};
/// Use this if the node hasn't been set up yet. Otherwise,
/// just this.parseEquation with equationText.
/*Node.parseEquation = function(nodeId, parentIds, equationText) {
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
}*/
/**
'engineOnly' means node is only visible to the engine, not in the interface
**/
Node.makeNodeFromXdslEl = function (el, $xdsl, opts) {
	opts = opts || {};
	opts.engineOnly = opts.engineOnly || false;

	var $el = $(el);
	var states = $el.find("state").toArray().map(function(a,i){ return new State({id:$(a).attr("id"), index: i}); });
	var stateIndex = {}; states.forEach(function(a,i) { stateIndex[a.id] = i; });
	var def = null;
	var defType = null;
	var cpt = null;
	var funcTable = null;
	var func = null;
	var funcDef = null;
	var funcText = null;
	var utils = null;

	if ($el.is("cpt")) {
		cpt = $el.find("probabilities").text()._splitNotEmpty(/\s+/).map(function(p){return parseFloat(p)});
		def = new CPT(null, cpt);
	}
	else if ($el.is("deterministic")) {
		var map = $el.find("resultingstates").text()._splitNotEmpty(/\s+/);
		funcTable = [];
		for (var i in map) {
			funcTable.push( stateIndex[map[i]] );
		}
		def = new CDT(null, funcTable);
	}
	else if ($el.is("equation")) {
		var parentIds = $el.find("parents").text().split(/\s+/);
		funcText = $el.find("definition").text();
		def = new Equation(null, funcText);
	}
	else if ($el.is("decision")) {
		/// Replace with uniform CPT --- later, though, because we don't necessarily know
		/// enough about the parents yet
	}
	else if ($el.is("utility")) {
		utils = $el.find("utilities").text()._splitNotEmpty(/\s+/).map(function(p){return parseFloat(p)});
		states = utils.map(function(a,i){ return new State({id: a, index: i}) });
		funcTable = [];
		for (var i in utils) {
			funcTable[i] = i;
		}
		def = new CDT(null, funcTable);
	}
	var $extInfo = $xdsl.find("> extensions > genie node#"+$el.attr("id"));
	/// Determine the submodel to which this node belongs
	var submodelPath = [];
	$extInfo.parents('submodel').each(function() {
		submodelPath.unshift($(this).attr("id"));
	});
	var posInfo = $extInfo.find("position").text().split(/\s+/);
	var comment = null;
	if ($extInfo.find("> comment")) {
		comment = $extInfo.find("> comment").text();
	}
	var label = null;
	if ($extInfo.find("> name")) {
		label = $extInfo.find("> name").text();
	}
	var format = {};
	if ($extInfo.find("> interior")) {
		format.backgroundColor = '#'+$extInfo.find("> interior").attr("color");
	}
	if ($extInfo.find("> outline")) {
		format.borderColor = '#'+$extInfo.find("> outline").attr("color");
	}
	/// displayStyle will be default, unless explicitly specified with barchart
	if ($extInfo.find('> barchart')) {
		if ($extInfo.find('> barchart').attr('active')!='true') {
			format.displayStyle = 'label';
		}
		else {
			format.displayStyle = 'detailed';
		}
	}
	if ($extInfo.find("> font")) {
		format.fontColor = '#'+$extInfo.find("> font").attr("color");
		format.fontFamily = $extInfo.find("> font").attr("name");
		format.fontSize = $extInfo.find("> font").attr("size");
	}
	/// Detect default colors, and remove them if present
	/// XXX: Ideally, these would just be indicated by absence, but GeNIe forces them
	if (format.backgroundColor == '#e5f6f7' && format.borderColor == '#0000bb' && format.fontColor == '#000000') {
		format.backgroundColor = null;
		format.borderColor = null;
		format.fontColor = null;
	}
	if (format.fontFamily == 'Arial' && format.fontSize == '8') {
		format.fontFamily = null;
		format.fontSize = null;
	}

	//onsole.log("OPTS:", opts);

	/// We will define what we can for Node, and then fix things
	/// up later.
	var node = new Node({
		net: opts.net,
		id: $el.attr("id"),
		label: label,
		type: $el.is("decision") ? "decision" : $el.is("utility") ? "utility" : "nature",
		states: states,
		parents: $el.find("parents").text()._splitNotEmpty(/\s+/),
		def: def,
		values: utils,
		dbnOrder: $el.is("[order]") ? Number($el.attr("order")) : 0,
		dynamic: $el.attr("dynamic")=="plate",
		engineOnly: opts.engineOnly,
		pos: {x: Number(posInfo[0]), y: Number(posInfo[1])},
		size: {width: Number(posInfo[2])-Number(posInfo[0]), height: Number(posInfo[3])-Number(posInfo[1])},
		comment: comment,
		format: format,
		submodelPath: submodelPath,
	});

	return node;
}
Object.assign(Node.prototype, {
	/// Most of this function involves introducing the new Node to the rest
	/// of the world
	init: function(o) {
		o = o || {};
		var node = this;

		/// Create a valid ID. If id was like a label, put it into label
		/// No checking for duplicates (which assumes a Net)
		let origId = undefined;
		let idExists = this.net?.find?.(node.id);
		if (!node.id || idExists) {
			origId = node.id;
			node.id = genPass(10);
		}
		let validId = makeValidId(node.id);
		if (node.id != validId) {
			if (!node.label) {
				node.label = origId ?? node.id;
			}
			node.id = validId;
		}
		if (idExists) {
			this.renameToUnique({id:origId});
		}

		/// Make setter do the right thing, instead of this
		if (!node.net)  node.net = null;

		node._updateDisplay = !node.engineOnly;

		if (!node.states || !node.states.length) {
			node.states = ["true","false"];
		}

		/// Convert states, if needed
		if (node.states.length && !node.states[0].id) {
			var statesById = {};
			var stateObjects = [];
			for (var i=0; i<node.states.length; i++) {
				var state = new State({id: node.states[i], index: i});
				stateObjects.push(state);
				statesById[node.states[i]] = state;
			}
			node.states = stateObjects;
			node.statesById = statesById;
		}

		if (node.def) {
			node.def.node = node;
		}
		
		/// Observe by default
		node.intervene = false;

		/// Setup the vectors needed for the inference (needed even if using workers)
		node.beliefs = new Float32Array(new ArrayBuffer(node.states.length*4));
		node.counts = new Float32Array(new ArrayBuffer(node.states.length*4));
		node.parentStates = new Float32Array(new ArrayBuffer(node.parents.length*4));

		/// We can only do the following if we've been assigned a net
		if (this.net !== null) {
			if (!node.id) {
				var i = 0;
				while (node.net.nodesById["node"+i]) i++;
				node.id = "node"+i;
			}

			/// If no submodel specified, use current submodel
			if (!o.submodelPath && !this.submodelPath) {
				this.submodelPath = this.net.currentSubmodel.slice();
			}
			/// Notify submodel
			this.moveToSubmodel(this.submodelPath);

			var bn = this.net;

			/// Add to children in parents
			for (var i=0; i<node.parents.length; i++) {
				var parent = node.parents[i];
				/// If we're in the middle of loading from a file, parent may
				/// just be a string still. It won't load here, but will get compiled properly later.
				if (bn.nodesById[parent]) {
					parent = bn.nodesById[parent];
					node.parents[i] = parent;
				}
				if (typeof(parent)=="object") {
					if (parent.children.indexOf(node)==-1) {
						parent.children.push(node);
					}
				}
			}

			/// We may have been given children. Handle. Much like parents,
			/// but need to handle definition update.
			for (var i=0; i<node.children.length; i++) {
				var child = node.children[i];
				if (bn.nodesById[child]) {
					child = bn.nodesById[child];
					node.children[i] = child;
				}
				if (typeof(child)=="object") {
					//var oldNode = this.duplicate(this.id, null, true);
					if (child.parents.indexOf(node)==-1) {
						var oldChild = child.duplicateLocal();
						child.parents.push(node);
						child.def.updateChild({oldChild});
					}
				}
			}
		}

		/// Need to do this after we've handled parents and children
		if (!node.def) {
			node.def = new CPT(node);
		}

		if (this.net !== null && !bn.nodes.includes(node)) {
			/// Notify the network
			bn.nodes.push(node);
			bn.nodesById[node.id] = node;
			if (node.type == "utility") {
				bn._utilityNodes.push(node);
			}
			else if (node.type == "decision") {
				bn._decisionNodes.push(node);
			}

			bn.needsCompile = true;
			/// Update node count, comments, etc. (if present)
			bn.updateViewer = true;

			/// XXX Remove the following
			if (o.addToCanvas) {
				bn.display();
				bn.updateAndDisplayBeliefs();
			}
		}
	},

	/// The domain is the set of variables involved in the node's local
	/// relationship. i.e. The node and its parents.
	getDomain() {
		return [this.id, ...this.parents.map(p=>p.id)];
	},
	/* Rewrite, remove recursion for desc/anc
	dir = 0: parents/children, 1: parents, 2: children
	
	I have no idea why I implemented circleVisited...
	*/
	getNeighbors(o = {}, dir = 0, visited = new Map(), circleVisited = new Set()) {
		o.stopIf ??= _=>false;
		o.stopAfter ??= _=>false;
		o.arcs ??= false;
		o.blockOn ??= false;
		o.dropBlockedPath ??= true;
		let imBlocked = false;
		let descendants = [];
		if (circleVisited)  circleVisited.add(this);
		if (o.blockOn && o.blockOn(this)) { imBlocked = true; }
		else {
			if (!o.stopAfter(this)) {
				let arcDir = (a,b) => a.isParent(b) ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
				let neighbors = dir == 0 ? this.parents.concat(this.children) : dir == 1 ? this.parents : this.children;
				let filteredChildren = neighbors.filter(c => !o.stopIf(c) && !visited.has(c) && (!circleVisited || !circleVisited.has(c)));
				descendants = !o.arcs ? filteredChildren.slice() : neighbors.map(c => arcDir(this,c));
				for (let child of filteredChildren) {
					descendants.push(...child.getNeighbors(o, dir, visited, circleVisited ? new Set(circleVisited) : null));
					if (o.dropBlockedPath && visited.get(child).blocked)  descendants.splice(descendants.indexOf(o.arcs ? arcDir(this,child) : child), 1);
				}
				if (o.blockOn) {
					let toVisitChildren = neighbors.filter(c=>!o.stopIf(c) && (!circleVisited || !circleVisited.has(c)));
					imBlocked = toVisitChildren.length && toVisitChildren.reduce((a,c)=>a&&visited.get(c).blocked, true);
				}
			}
		}
		visited.set(this, {blocked: imBlocked});
		if (imBlocked)  return Object.assign([], {blocked:true});
		return [...new Set(descendants)];
	},
	getDescendants(o = {}) {
		return this.getNeighbors(o, 2, new Map(), null);
	},
	getAncestors(o = {}) {
		return this.getNeighbors(o, 1, new Map(), null);
	},
	/*getAncestors(o = {}, visited = new Set()) {
		o.stopIf ??= _=>false;
		o.arcs ??= false;
		o.blockOnEvidence ??= false;
		let filteredParents = this.parents.filter(p => !o.stopIf(p) && !visited.has(p) && (!o.blockOnEvidence || !c.hasEvidence()));
		let ancestors = !o.arcs ? filteredParents : this.parents.map(p => `${p.id}-${this.id}`);
		ancestors.forEach(p => visited.add(p));
		for (let parent of filteredParents) {
			ancestors.push(...parent.getAncestors(o, visited));
		}
		return [...new Set(ancestors)];
	},*/
	wouldBeCycleIfParent(parent) {
		if (this == parent)  return true;
		/// XXX Rewrite for better perf
		return this.getDescendants().includes(parent);
	},
	wouldBeCycleIfChild(child) {
		if (this == child)  return true;
		/// XXX Rewrite for better perf
		return this.getAncestors().includes(child);
	},
	wouldBeCycle(otherNode, otherNodeIsParent = true) {
		if (otherNodeIsParent)  return this.wouldBeCycleIfParent(otherNode);
		return this.wouldBeCycleIfChild(otherNode);
	},
	getPathsDownTo(otherNode) {
		let matchFunc = otherNode;
		if (typeof(otherNode)!='function') {
			matchFunc = curNode => curNode==otherNode;
		}
		let openPaths = this.children.slice().map(n => [n]);
		let provenPaths = [];
		
		while (openPaths.length) {
			let curPath = openPaths.pop();
			if (matchFunc(curPath.at(-1))) {
				provenPaths.push(curPath);
			}
			else if (curPath.at(-1).children.length) {
				openPaths.push(...curPath.at(-1).children.map(c => curPath.concat(c)));
			}
			/// else leaf, and nothing more to find
		}
		// console.log(provenPaths.map(a => a.map(n => n.id)));
		return provenPaths;
	},
	getPathsUpTo(otherNode) {
		let openPaths = this.parents.slice().map(n => [n]);
		let provenPaths = [];
		
		while (openPaths.length) {
			let curPath = openPaths.pop();
			if (curPath.at(-1)==otherNode) {
				provenPaths.push(curPath);
			}
			else if (curPath.at(-1).parents.length) {
				openPaths.push(...curPath.at(-1).parents.map(c => curPath.concat(c)));
			}
			/// else leaf, and nothing more to find
		}
		// console.log(provenPaths.map(a => a.map(n => n.id)));
		return provenPaths;
	},
	/// FIX: Not node specific, move to net
	getCommonAncestors(nodes, type = 'pairwise') {
		/// inefficient much
		let allCommon = new Set();
		for (let i=0; i<nodes.length; i++) {
			for (let j=i+1; j<nodes.length; j++) {
				let common = new Set(nodes[i].getAncestors({stopIf:n=>n==nodes[j]})).intersection(new Set(nodes[j].getAncestors({stopIf:n=>n==nodes[i]})));
				/// Now remove any ancestors higher up
				for (let node of common) {
					common = common.difference(node.getAncestors());
				}
				allCommon = allCommon.union(common);
			}
		}
		return allCommon;
	},
	/// FIX: Not node specific, move to net
	getCommonDescendants(nodes, o = {}) {
		o.pairwise ??= true;
		o.all ??= false;
		/// inefficient much
		let allCommon = new Set();
		for (let i=0; i<nodes.length; i++) {
			for (let j=i+1; j<nodes.length; j++) {
				let common = new Set(nodes[i].getDescendants({stopIf:n=>n==nodes[j]})).intersection(new Set(nodes[j].getDescendants({stopIf:n=>n==nodes[i]})));
				/// Now remove any descendants lower down
				if (!o.all) {
					for (let node of new Set(common)) {
						common = common.difference(node.getDescendants());
					}
				}
				allCommon = allCommon.union(common);
			}
		}
		return allCommon;
	},
	/// FIX: Not node specific, move to net
	getDirected(allNodes, o = {}) {
		o.arcs ??= false;
		o.blockOn ??= false;
		
		let nextO = {arcs: o.arcs, blockOn: o.blockOn};
		let foundNodes = new Set();
		for (let i=0; i<allNodes.length; i++) {
			for (let j=0; j<allNodes.length; j++) {
				if (i==j)  continue;
				if (!o.arcs) {
					let nodes = new Set(allNodes[i].getDescendants().concat(allNodes[i])).intersection(allNodes[j].getAncestors().concat(allNodes[j]));
					foundNodes = foundNodes.union(nodes);
				}
				else {
					let arcs = new Set(allNodes[i].getDescendants({...nextO,stopAfter:n=>n==allNodes[j]})).intersection(allNodes[j].getAncestors({...nextO,stopAfter:n=>n==allNodes[i]}));
					foundNodes = foundNodes.union(arcs);
				}
			}
		}
		return [...foundNodes];
	},
	getDconnectedIndirect(allNodes, o = {}) {
		o.noSourceParents ??= false;
		o.noSourceChildren ??= false;
		let arcsToPaths = arcs => {
			return arcs.map(arc => arc.split(/-/).map(id => this.net.node[id]));
		};
		if (allNodes.length>=2) {
			let cause = allNodes[1].hasAncestor(allNodes[0]) ? allNodes[0] : allNodes[0].hasAncestor(allNodes[1]) ? allNodes[1] : allNodes[0];
			let effect = allNodes[0]== cause ? allNodes[1] : allNodes[0];
			let dc = new Set(this.net.findAllDConnectedNodes4(cause, effect, {arcs:true, ...o}));
			let directed = this.getDirected(allNodes, {arcs:true,blockOn:n=>n.hasEvidence()});
			let indirect = dc.difference(directed);
			let onPathNodes = new Set();
			let directedNodes = new Set(arcsToPaths([...directed]).flat());
			let indirectNodes = new Set(arcsToPaths([...indirect]).flat());
			for (let node of directedNodes) {
				if (node==effect)  continue;
				for (let neighbor of node.children.concat(node.parents)) {
					if (!allNodes.includes(neighbor) && indirectNodes.has(neighbor)) {
						onPathNodes = onPathNodes.union(this.getDirected([node, cause],{arcs:true,blockOn:n=>n.hasEvidence()}));
					}
				}
			}
			return [...indirect.union(onPathNodes)];
		}
		return [];
	},
	getBackdoorPaths(allNodes) {
		return this.getDconnectedIndirect(allNodes, {noSourceChildren: true});
	},
	getSelectionBias(allNodes) {
		return this.getDconnectedIndirect(allNodes, {noSourceParents: true});
	},
	/// |relationType| can be a string (e.g. 'parent') or array (e.g. ['parent', 'child'])
	getRelated(relationType, allNodes) {
		let arcsToPaths = arcs => {
			return arcs.map(arc => arc.split(/-/).map(id => this.net.node[id]));
		};
		/// Run |getRelated| for each relationship type, and return all distinct nodes found
		if (typeof(relationType)!='string') {
			let nodes = new Set();
			relationType.forEach(r => this.getRelated(r).forEach(n => nodes.add(n)));
			return [...nodes];
		}
		
		if (relationType == 'parent') {
			return [...this.parents];
		}
		else if (relationType == 'child') {
			return [...this.children];
		}
		else if (relationType == 'direct') {
			return this.parents.concat(this.children);
		}
		else if (relationType == 'ancestor') {
			return this.getAncestors();
		}
		else if (relationType == 'descendant') {
			return this.getDescendants();
		}
		else if (relationType == 'dconnected') {
			/// XXX: Move the dconnected function to Node
			return this.net.findAllDConnectedNodes2(this);
		}
		else if (relationType == 'markovBlanket') {
			return [...new Set([...this.parents,...this.children,...this.children.map(c => c.parents).flat()])];
		}
		else if (relationType == 'directedPaths') {
			return this.getDirected(allNodes);
		}
		else if (relationType == 'confounder' || relationType == 'commonCause' || relationType == 'commonAncestor'
				|| relationType == 'confounderActive') {
			let workingBn = this.net;
			let workingNode = this;
			let workingNodes = allNodes;
			if (relationType == 'confounderActive') {
				let nodesA = this.net.findAllDConnectedNodes2(allNodes[0], {includeEvidence:true, stopAfter: n => n == allNodes[1]});
				let nodesB = this.net.findAllDConnectedNodes2(allNodes[1], {includeEvidence:true, stopAfter: n => n == allNodes[0]});
				let commonDNodes = [...new Set(nodesA).intersection(nodesB)];
				workingBn = this.net.makeFilteredStructure(commonDNodes);
				workingNode = workingBn.node[this.id];
				if (!workingNode)  return [];
				workingNodes = allNodes.map(n => workingBn.node[n.id]).filter(v => v);
			}
			let allCommon = workingNode.getCommonAncestors(workingNodes);
			/// These are known ancestors of both, just get paths down to effects
			let allExtraNodes = new Set();
			for (let node of allCommon) {
				let extraNodes = node.getPathsDownTo(workingNode).flat();
				allExtraNodes = allExtraNodes.union(extraNodes);
			}
			
			return [...allCommon.union(allExtraNodes)].map(n => this.net.node[n.id]);
		}
		else if (relationType == 'collider' || relationType == 'colliderActive') {
			let workingBn = this.net;
			let workingNode = this;
			let workingNodes = allNodes;
			if (relationType == 'colliderActive') {
				workingBn = this.net.makeFilteredStructure(this.net.findAllDConnectedNodes2(allNodes[0], {includeEvidence:true}));
				workingNode = workingBn.node[this.id];
				if (!workingNode)  return [];
				workingNodes = allNodes.map(n => workingBn.node[n.id]).filter(v => v);
			}
			let allCommon = workingNode.getCommonDescendants(workingNodes);
			/// These are known descendants of both, just get paths up to effects
			let allExtraNodes = new Set();
			for (let node of allCommon) {
				let extraNodes = node.getPathsUpTo(workingNode).flat();
				allExtraNodes = allExtraNodes.union(extraNodes);
			}
			if (relationType == 'colliderActive') {
				/// Add in path to nearest downstream evidence(s)
				let allDownstreamEvidences = new Set();
				for (let node of allCommon) {
					node = this.net.node[node.id];
					let downstreamEvidences = node.getPathsDownTo(n => n.hasEvidence()).flat();
					allDownstreamEvidences = allDownstreamEvidences.union(downstreamEvidences);
				}
				allExtraNodes = allExtraNodes.union(allDownstreamEvidences);
			}
			
			return [...allCommon.union(allExtraNodes)].map(n => this.net.node[n.id]);
		}
		else if (relationType == 'dconnectedPaths') {
			if (allNodes.length>=2) {
				let arcs = this.net.findAllDConnectedNodes4(allNodes[0], allNodes[1],{arcs:true});
				return {paths:arcsToPaths(arcs).concat([[allNodes[0]], [allNodes[1]]])};
			}
		}
		else if (relationType == 'dconnectedIndirect') {
			/// Likely wrong
			/*let dNodes = [];
			for (let an of allNodes) {
				let otherNodes = allNodes.filter(n => n!=an);
				dNodes.push(new Set(this.net.findAllDConnectedNodes2(an, {stopIf: n => otherNodes.includes(n)})));
			}
			let commonDNodes = dNodes.length >= 2 ? dNodes.reduce((a,v)=>a.intersection(v)) : dNodes.length >= 1 ? dNodes[0] : [];
			// let commonDNodes = dNodes.reduce((a,v) => a.union(v), new Set());
			return [...commonDNodes];
			let directed = this.getDirected(allNodes);
			// return [...commonDNodes.difference(directed)];*/
			let arcs = this.getDconnectedIndirect(allNodes);
			return {paths:arcsToPaths(arcs).concat(allNodes.map(n => [n]))};
		}
		else if (relationType == 'backpaths' || relationType =='backdoorPaths') {
			let arcs = this.getBackdoorPaths(allNodes);
			return {paths:arcsToPaths(arcs).concat(allNodes.map(n => [n]))};
		}
		else if (relationType == 'selectionBias') {
			let arcs = this.getSelectionBias(allNodes);
			return {paths:arcsToPaths(arcs).concat(allNodes.map(n => [n]))};
		}
		return [];
	},
	addToNet(net) {
		//return net.addNode(this.id, this.states.map(s=>s.id), this);
		this.net = net;
		this.init();
		return this;
	},
	/**
	Return the size of the Cartesian product of all the parents,
	assuming all the parents are discrete.
	XXX Handle non-discrete parents.
	*/
	numParentCombinations: function() {
		var numParentStates = 1;
		for (var j=0; j<this.parents.length; j++) {
			numParentStates *= this.parents[j].states.length;
		}
		return numParentStates;
	},
	/// This method blows away any previous states, and writes in new ones
	setStates: function(states, opts) {
		this.states = states.map((a,i)=>new State({id:a,index:i}));
		this.statesById = {};
		for (var i=0; i<this.states.length; i++) {
			this.statesById[this.states[i].id] = this.states[i];
		}

		/// Update the belief vectors
		this.beliefs = new Float32Array(new ArrayBuffer(this.states.length*4));
		this.counts = new Float32Array(new ArrayBuffer(this.states.length*4));
	},
	/// Duplicate this node, state and definition, along with parent
	/// node and states (but not definitions).
	/// The default is to do a minimal duplication to capture the relationship,
	/// but other properties can be included.
	///	The local fragment is NOT attached to the current network.
	/// XXX: States are also not duplicated. Make them duplicated? Yes. Yes, they need to
	/// be duplicated.
	duplicateLocal: function(o = {}) {
		/// Make parents
		var newParents = [];
		for (var parent of this.parents) {
			var states = JSON.parse(JSON.stringify(parent.states));
			var statesById = states.reduce((a,v) => (a[v.id] = v, a), {});
			newParents.push(
				new Node({id: parent.id, states, statesById})
			);
		}
		var states = clone(this.states);
		//debugger;
		var statesById = states.reduce((a,v) => (a[v.id] = v, a), {});
		/// Make child
		var child = new Node({id: this.id, def: this.def.duplicate(),
			states, statesById,
			parents: newParents});
		child.def.node = child;
		Object.assign(child, o);

		return child;
	},
	/// Add the states with the names in |newStates|.
	/// |opts| - Options object. Properties:
	///    |at| - The insertion point
	///    |updateChildren| - (bool) Whether to update child definitions (default=true)
	addStates: function(newStates, opts) {
		opts = opts || {};
		var insertPoint = opts.at != undefined ? opts.at : this.states.length;
		var updateChildren = typeof(opts.updateChildren)=="undefined" ? true : opts.updateChildren;
		var oldChildren = [];

		if (updateChildren) {
			for (var child of this.children) {
				oldChildren.push( child.duplicateLocal() );
			}
			//oldNode = this.duplicate(this.id, null, true);
		}

		var numStates = this.states.length;
		var numNewStates = numStates + newStates.length;

		for (var i=0; i<newStates.length; i++) {
			var stateName = newStates[i];
			this.states.splice(insertPoint+i, 0, new State({id: stateName, index: i}));
			this.statesById[stateName] = this.states[insertPoint];
		}
		/// And now let's update all the indices...
		for (var i=0; i<this.states.length; i++)  this.states[i].index = i;

		/// Update the belief vectors
		this.beliefs = new Float32Array(new ArrayBuffer(this.states.length*4));
		this.counts = new Float32Array(new ArrayBuffer(this.states.length*4));

		/// Update the definition
		this.def.updateStates({oldNumStates: numStates, newNumStates: numNewStates,
			insertPoint: insertPoint});

		/// Update children
		if (updateChildren) {
			for (var [i,child] of Object.entries(this.children)) {
				child.def.updateChild({oldChild: oldChildren[i]});
			}
		}

		/// Update the state-dependent inf states
		//this.beliefs = new Float32Array(new ArrayBuffer(this.states.length*4));
		//this.counts = new Float32Array(new ArrayBuffer(this.states.length*4));

		if (this.net)  this.net.needsCompile = true;

		return this;
	},
	/// statesToRemove=* -> remove all, statesToRemove = [1,2,"gary"] -> remove states
	/// with the given name or index
	removeStates: function(statesToRemove, opts) {
		opts = opts || {};
		var updateChildren = typeof(opts.updateChildren)=="undefined" ? true : opts.updateChildren;
		var oldChildren = [];

		if (updateChildren) {
			for (var child of this.children) {
				oldChildren.push( child.duplicateLocal() );
			}
		}

		var numStates = this.states.length;
		var numNewStates = null;

		if (statesToRemove === "*") {
			numNewStates = 0;
			statesToRemove = new Array(this.states.length).fill(0).map((v,i) => i);
			this.states = [];
			this.statesById = {};
		}
		else {
			numNewStates = this.states.length - statesToRemove.length;

			/// Convert all state refs to indexes
			for (var i=0; i<statesToRemove.length; i++) {
				if (typeof(statesToRemove[i])=="string") {
					statesToRemove[i] = this.statesById[statesToRemove[i]].index;
				}
			}
			/// Sort in descending order
			statesToRemove.sort((a,b)=>b-a);
			console.log(statesToRemove);
			/// Remove the states
			for (var i=0; i<statesToRemove.length; i++) {
				var delState = this.states.splice(statesToRemove[i], 1)[0];
				delete this.statesById[delState.id];
			}
			/// And now let's update all the indices...
			for (var i=0; i<this.states.length; i++)  this.states[i].index = i;
		}
		this.def.updateStates({oldNumStates: numStates, newNumStates: numNewStates,
			removedI: statesToRemove});

		/// Update children
		if (updateChildren) {
			for (var [i,child] of Object.entries(this.children)) {
				child.def.updateChild({oldChild: oldChildren[i]});
			}
		}

		if (this.net)  this.net.needsCompile = true;
	},
	/// |renames| is an object that can take either state indexes or
	/// (previous) IDs as keys, and the new IDs as values
	renameStates: function(renames) {
		var renamesArr = [];
		/// Work out renames based on indexes (which remain constant) first
		for (var oldId in renames) {
			var newId = renames[oldId];
			var stateIndex = Number(oldId);
			if (isNaN(stateIndex)) {
				stateIndex = this.statesById[oldId].index;
			}
			renamesArr.push([stateIndex, newId]);
		}
		/// Do the renames
		for (var [stateIndex,newId] of renamesArr) {
			var oldId = this.states[stateIndex].id;
			if (oldId != newId) {
				this.states[stateIndex].id = newId;
				delete this.statesById[oldId];
				this.statesById[newId] = this.states[stateIndex];
			}
		}
	},
	/// |moves| is an object that can take either state indexes or
	/// IDs as keys, and state indexes or names to move to as values.
	/// Keys (or from states) are locked to IDs, while values (or to states)
	/// are locked to indexes. I believe this is the most logical way to do
	/// it, because you can say 'Take the state that happens to be in pos 3
	/// right now, and move it to pos 1' (whether you name the state, or the index).
	/// NOTE ON ORDER: Because Google decided to fuck up object key order for everyone,
	/// numbered indexes will be moved first, and in numeric order (not in entry order).
	/// Thanks Google!
	/// To play it safe, use state IDs instead.
	/// (Note, this method only makes sense with CPT nodes.)
	moveStates: function(moves, opts = {}) {
		var updateChildren = typeof(opts.updateChildren)=="undefined" ? true : opts.updateChildren;
		opts.childrenOnly ??= false;
		var oldChildren = [];

		if (updateChildren) {
			for (var child of this.children) {
				oldChildren.push( child.duplicateLocal() );
			}
		}

		var movesArr = [];
		/// For moving, *ids* are constant for 'from', while *indexes*
		/// are constant for 'to'
		for (var [fromStateI,toStateI] of Object.entries(moves)) {
			if (!isNaN(fromStateI))  fromStateI = this.states[fromStateI].id;
			if (isNaN(toStateI))  toStateI = this.statesById[toStateI].index;
			movesArr.push([fromStateI,toStateI]);
		}
		for (var [fromStateI,toStateI] of movesArr) {
			/// Ensure from/to are both numbers
			fromStateI = Number(this.statesById[fromStateI].index);
			toStateI = Number(toStateI);

			/// Update this node's CPT
			var dir = fromStateI < toStateI ? 1 : -1;
			this.def.updateStates({fromStateI, toStateI});

			/// Update state indexes
			var savedFrom = this.states[fromStateI];
			for (var i=fromStateI; i!=toStateI; i+=dir) {
				this.states[i] = this.states[i + dir];
				this.states[i].index = i;
			}
			this.states[toStateI] = savedFrom;
			this.states[toStateI].index = toStateI;
		}

		/// Update children
		if (updateChildren) {
			for (var [i,child] of Object.entries(this.children)) {
				child.def.updateChild({oldChild: oldChildren[i]});
			}
		}

		if (this.net)  this.net.needsCompile = true;
	},
	moveParents(opts = {}) {
		opts.moves ??= null;
		opts.order ??= null;
		/// Rearrange parents in definition (e.g. CPT)
		/// (Unfortunately named |updateChild| can actually be used to just update me)
		let oldChild = this.duplicateLocal();
		let newParents = this.parents.slice();
		if (opts.moves) {
			let parentIndexes = Object.fromEntries(Object.entries(newParents).map(([i,p]) => [p.id,i]));
			let toMove = new Set();
			let fixed = {};
			let fill = [];
			/// Convert to all ints
			for (let k in opts.moves) {
				let i = isNaN(k) ? parentIndexes[k] : k;
				let toI = isNaN(opts.moves[k]) ? parentIndexes[opts.moves[k]] : opts.moves[k];
				fixed[toI] = i;
				toMove.add(i);
			}
			/// Get all things that aren't being explicitly moved
			for (let i=0; i<newParents.length; i++) {
				if (!toMove.has(i)) {
					fill.push(newParents[i]);
				}
			}
			/// Now move
			for (let i=0, j=0; i<newParents.length; i++) {
				if (i in fixed) {
					newParents[i] = this.parents[fixed[i]];
				}
				else {
					newParents[i] = fill[j];
					j++;
				}
			}
		}
		else if (opts.order) {
			for (let [i,j] of opts.order.entries()) {
				newParents[i] = this.parents[j];
			}
			/// Can I overwrite parents array like this?
		}
		this.parents = newParents;
		
		this.def.updateChild({oldChild: oldChild});
		
		if (this.net)  this.net.needsCompiled = true;
	},
	/// Rename this node to |newId|. If there is already a node called newId,
	/// the function fails and emits a warning (but does not halt or stop the chaining).
	rename: function(newId) {
		var oldId = this.id;
		/// Fix newId if needed
		newId = makeValidId(newId);
		if (this.net) {
			if (newId in this.net.nodesById) {
				console.log("Can't rename node because '"+newId+"' already exists.");
				return this;
			}
			delete this.net.nodesById[this.id];
			this.net.nodesById[newId] = this;
		}
		this.id = newId;

		/// The definition may need to do something to handle renames
		this.def?.renameNode?.(oldId, newId);

		return this;
	},
	/** I'm not precisely sure how this could have worked. It's only for renaming
	existing node ids, but I can't see the point of that... Unless it was for the DBN rollout...
	
	Unique handling needs to be rewritten. Might be best to use approach from bni.
	
	**/
	renameToUnique(o = {}) {
		o = {
			id: this.id,
			net: this.net,
			idExists(possId) { return this.net.find(possId); },
			...o
		};
		let m = o.id.match(/^.*_(\d+)$/);
		let idCounter = m ? m[1] : 1;
		let baseId = o.id.replace(/^(.*)_\d+$/, '$1');
		let newId = null;
		do {
			newId = baseId + `_${idCounter}`;
			idCounter++;
		} while(o.idExists(newId));

		this.rename(newId);

		return this;
	},
	/// The following methods are not meant to be called directly (hence the _ underscore)
	/// Call addParents instead, and pass it a list of parents (even if just one).
	_addParent: function(parent, {noUpdate} = {noUpdate: false}) {
		if (typeof(parent)=="string")  parent = this.net.nodesById[parent];

		/// Check that parent is not already present
		if (this.parents.findIndex(function(p) { return p == parent })==-1) {
			console.assert(!this.parents.find(p => p.id == parent.id), "Parent ID already exists");
			console.log({noUpdate});
			if (!noUpdate)  var oldChild = this.duplicateLocal();
			this.parents.push(parent);
			/// Some chance parents/children lists are out of sync, but if so we have bigger problems
			parent.children.push(this);

			//this.updateDefinition({type: 'parentsChanged', oldNode: oldNode});
			if (!noUpdate)  this.def.updateChild({oldChild});
			
			this.net.needsCompile = true;
		}
	},
	_addChild: function(child, {noUpdate} = {noUpdate: false}) {
		var prevChild = child;
		if (typeof(child)=="string")  child = this.net.nodesById[child];
		if (!child)  throw new Exception("No such node: "+prevChild);

		child._addParent(this, {noUpdate});
	},
	_removeParent: function(parent) {
		if (typeof(parent)=="string")  parent = this.net.nodesById[parent];

		var child = this;
		var parentIndex = this.parents.findIndex(function(p) { return p == parent });
		var childIndex = parent.children.findIndex(function(c) { return c == child });

		console.log(parentIndex, childIndex);

		if (parentIndex !=-1 && childIndex !=-1) {
			var oldChild = this.duplicateLocal();

			/// We want to modify copies, not originals
			/// so that things that save pointers to originals (always internal only)
			/// are still valid
			this.parents = this.parents.slice();
			parent.children = parent.children.slice();

			this.parents.splice(parentIndex, 1);
			parent.children.splice(childIndex, 1);

			this.def.updateChild({oldChild});
		}
	},
	_removeChild: function(child) {
		if (typeof(child)=="string")  parent = this.net.nodesById[child];

		child._removeParent(this);
	},
	/// XXX The list versions aren't terribly efficient, but should be OK
	/// most of the time
	/// Each |parent| can be a string or a node
	addParents: function(parents, {noUpdate} = {noUpdate: false}) {
		for (var i=0; i<parents.length; i++)  this._addParent(parents[i], {noUpdate});
		return this;
	},
	/// Each |child| can be a string or a node
	addChildren: function(children, {noUpdate} = {noUpdate: false}) {
		for (var i=0; i<children.length; i++)  this._addChild(children[i], {noUpdate});
		return this;
	},
	/// Each |parent| can be a string or a node
	removeParents: function(parents) {
		for (var i=0; i<parents.length; i++)  this._removeParent(parents[i]);
		return this;
	},
	/// Each |child| can be a string or a node
	removeChildren: function(children) {
		for (var i=0; i<children.length; i++)  this._removeChild(children[i]);
		return this;
	},
	/// For any references in the node, make the node point to the right thing
	/// XXX A work in progress still...
	updateItemReferences(idMap) {
		/// Update parents and children
		for (let list of [this.parents, this.children]) {
			for (let i=0; i<list.length; i++) {
				let newId = idMap[list[i].id];
				if (newId) {
					list[i] = this.net.find(newId);
				}
			}
		}
	},
	/// Set the type of the node, switching it in an undo-able way
	/// from whatever previous type the node had. To undo (straight after),
	/// just re-set the type back to its previous value.
	setType: function(nType) {
		if (nType == undefined)  return this.type;

		nType = nType.toLowerCase();

		if (nType == "decision") {
			this.def = new CPT(this);
		}
		else if (nType == "nature") {
			this.def = new CPT(this);
		}
		else if (nType == "utility") {
			var utils = [];
			var numParentCombos = this.numParentCombinations();
			for (var i=0; i<numParentCombos; i++)  utils.push(0);
			states = utils.map(function(a,i){ return new State({id: a, index: i}) });
			funcTable = [];
			for (var i in utils) {
				funcTable[i] = i;
			}
			this.values = utils;
			this.states = states;
			this.def = new CDT(this, funcTable);
			this.removeChildren(this.children);
		}

		if (this.net)  this.net.needsCompile = true;

		this.type = nType;

		return this;
	},
	/// Set the definition type of the node. In some cases, an attempt is made
	/// to preserve the underlying relationship between type switches. (Easy enough
	/// for now, very difficult in future with  more types.)
	setDefinitionType: function(defType) {
		if (defType == this.def.type)  return;

		this.def = new NodeDefinitions[defType](this.def);

		return this;
	},
	/// Set the values for the node. This will update the state names
	/// to match the values, which can be useful if the node states are
	/// being viewed in the network display.
	setValues: function(values, {updateStateNames} = {updateStateNames: true}) {
		funcTable = [];
		for (var i in values) {
			funcTable[i] = Number(i);
		}

		this.values = values;
		this.def.set(funcTable);

		if (updateStateNames) {
			states = values.map((a,i) => new State({id: a, index: i}));
			this.states = states;
		}

		this.net.needsCompile = true;

		return this;
	},
	/// Set the submodel for this node by specifying a path
	setSubmodelPath: function(path) {
		/// XXX Improve validation of the path
		path = BN.makeSubmodelPath(path);

		if (path !== null) {
			this.moveToSubmodel(path);
		}

		return this;
	},
	/**
	Return a string representation of the path to this node (not including the id of the
	node itself).
	*/
	getSubmodelPathStr: function() {
		return BN.makeSubmodelPathStr(this.submodelPath);
	},
	/// Move this node to the given submodel. |path| is a left-to-right array
	/// representing the path.
	moveToSubmodel: function(path) {
		var node = this;
		path = BN.makeSubmodelPath(path);
		
		/// Remove from old submodel (if there)
		var oldSubmodel = this.net.getSubmodel(this.submodelPath);
		if (oldSubmodel) {
			var oldIndex = oldSubmodel.subNodes.findIndex(function(v) { return v==node; });
			//onsole.log(oldIndex);
			if (oldIndex >= 0) {
				oldSubmodel.subNodes.splice(oldIndex,1);
			}
		}

		if (path instanceof Submodel) {
			path = path.submodelPath.concat([path.id]);
		}

		/// Save new path
		this.submodelPath = path.slice();

		/// Move node to new submodel
		this.net.getSubmodel(this.submodelPath).subNodes.push(this);
	},
	/// Create a duplicate node, that is *not*
	/// added to the net by default.
	/// If {addToNet: true} is specified, however, it will be added
	/// to the same net with a random ID.
	/// XXX This is not a proper duplicate function yet.
	duplicate(extraProps = {}) {
		let node = new Node();
		this.duplicateInto(node, extraProps);

		if (extraProps.addToNet) {
			let id = genPass(10);
			return this.net.addNode(id, this.states.map(s => s.id), node);
		}
		else {
			node.id = this.id;
			node.net = null;
			node.pathsIn = [];
			node.pathsOut = [];

			return node;
		}
	},
	/// This is like duplicate, but overwrites |this| with (selected) properties in |node|
	/// |node| doesn't have to be an actual node, it can be an empty plain object
	duplicateInto: function(node, extraProps) {
		/// Note: net is included in the duplication (the pointer, not the object value),
		/// but node is *not* added to the net (i.e.
		/// there's no ref. to this node from the net, only a ref to the net from this node)
		var propsToDuplicate = {label:1,parents:1,children:1,def:1,values:1,
			dbnOrder:1,dynamic:1,dynamicParents:1,engineOnly:1,comment:1,format:1,type:1,
			states:1,/*statesById:1,*/submodelPath:1,/*net:1,*/pos:1,size:1};
		//var propsToDuplicate = {parents:1,cpt:1};
		for (var i in this) {
			if (i in propsToDuplicate) {
				if (typeof(this[i])=="object") {
					if (this[i]==null) { node[i] = this[i]; }
					/// This works for arrays and typed arrays
					else if (i=="states") {
						node.states = [];
						node.statesById = {};
						for (var j=0; j<this.states.length; j++) {
							var newState = new State(this.states[j]);
							node.states[j] = newState;
							node.statesById[newState.id] = newState;
						}
					}
					else if (this[i].slice) {
						node[i] = this[i].slice();
					}
					else if (this[i].duplicate) {
						node[i] = this[i].duplicate();
						if ("node" in node[i])  node[i].node = node;
					}
					else {
						if (["net"].indexOf(i)!=-1) {
							node[i] = this[i];
						}
						else {
							console.log("DUPLICATE ELSE:", i);
							node[i] = new this[i].constructor();
							for (var k in this[i]) {
								if (this[i][k] && this[i][k].slice) {
									node[i][k] = this[i][k].slice();
								}
								else {
									node[i][k] = this[i][k];
								}
							}
						}
					}
				}
				else {
					console.log("definition");
					node[i] = this[i];
				}
			}
		}
		node.net = this.net;
		if (extraProps) {
			for (var i in extraProps) {
				node[i] = extraProps[i];
			}
		}
	},
	/// Delete this node from its network
	delete(o = {}) {
		o = {
			submodel: true,
			/// XXX To be implemented
			absorb: false,
			...o
		};
		var node = this;

		/// Remove from the net's references
		this.net.removeNodeRefs(this);

		/// Remove from the submodel's references
		if (o.submodel) {
			var submodel = this.net.getSubmodel(node.submodelPath);
			submodel.removeNodeRefs(this);
		}

		/// Remove from other nodes' references (in parents)
		for (let parent of this.parents) {
			parent.removeChildRefs(this);
		}
		for (let child of this.children) {
			/// If this node was a parent, we need special treatment, because it affects child definition
			/// Make copy of how node used to be
			/// (We need to pass in net for the lat
			var oldChild = child.duplicateLocal();
		
			child.removeParentRefs(this);

			child.def.updateChild({oldChild});
		}
		/// XXX Inefficient
		for (let otherNode of this.net.nodes) {
			var otherSubmodel = this.net.getSubmodel(otherNode.submodelPath);
			otherSubmodel.removePathRefs(this);
		}
		/** Display is updated in display section below. **/

		this.net.needsCompile = true;

		this.net = null;

		return this;
	},
	absorb: function() {
		return this.delete({absorb: true});
	},
	updateDiscretization() {
		/// We may have a manually specified discretisation. If so, don't over-write it
		/// XXX forChildrenOnly doesn't work properly yet
		if (!this.stateSpace.discretized || this.stateSpace.forChildrenOnly) {
			this.discretizeFromSamples();
		}
		else {
			/// States are fixed manually, so just need to update belief vector based on samples
			this.seen = 0;
			this.counts = new Array(this.states.length).fill(0);
			for (let i=0; i<this.samples.length; i++) {
				let val = this.samples[i];
				let stateI = -1;
				
				for (let j=0; j<this.states.length; j++) {
					let state = this.states[j];
					
					if (val < state.maximum) {
						stateI = j;
						break;
					}
				}
				
				this.counts[stateI] += this.sampleWeights[i];
				this.seen += this.sampleWeights[i];
			}
			
			this.beliefs = new Float32Array(this.counts.map(c => c/this.seen));
			this.counts = new Int32Array(this.counts);
		}
	},
	/// Creates a (simple, equal-width) dynamic discretisation from samples
	discretizeFromSamples: function() {
		console.log(this.id);
		var node = this;
		/// This needs to be moved somewhere, obviously...
		var maxStates = 10;
		/// Do we have something that looks discrete?
		var samplesSeen = new Map();
		for (var j=0; j<node.samples.length; j++) {
			samplesSeen.set(node.samples[j], (samplesSeen.get(node.samples[j]) || 0) + 1);
			if (samplesSeen.size > maxStates)  break;
		}
		if (samplesSeen.size <= maxStates) {
			var states = [];
			samplesSeen.forEach(function(v,k) {
				states.push([k,v]);
			});
			states.sort(function(a,b) { return a[0] - b[0] });
			var labels = [];
			var beliefs = [];
			for (var j=0; j<states.length; j++) {
				labels.push(sigFig(states[j][0],3));
				beliefs.push(states[j][1]/node.samples.length);
			}
			node.removeStates('*');
			node.addStates(labels);
			for (let j=0; j<node.states.length; j++) {
				let state = node.states[j];
				state.minimum = state.maximum = states[j][0];
			}
			node.beliefs = beliefs;
		}
		else {
			var discInfo = generateMultinomialFromSamples(node.samples, maxStates);
			node.removeStates('*');
			var labels = [];
			for (var j=0; j<discInfo.boundaries.length-1; j++) {
				labels[j] = '['+sigFig(discInfo.boundaries[j],3)+"-"+sigFig(discInfo.boundaries[j+1],3);
				labels[j] += (j+2==discInfo.boundaries.length) ? ']' : ')';
			}
			node.addStates(labels);
			for (let j=0; j<node.states.length; j++) {
				let state = node.states[j];
				state.minimum = discInfo.boundaries[j];
				state.maximum = discInfo.boundaries[j+1];
			}
			node.beliefs = discInfo.bins;
		}
		node._updateDisplay = true;
	},
	/**
	For CPT-based nodes, set uniform probability distributions for
	all rows.
	*/
	setUniform: function() {
		this.def.setUniform();
		return this;
	},
	/** Set an appropriate initial definition for the node based on its type.
	    For CPTs, this is a uniform CPT. For other things, what constitutes 'appropriate'
	    is often less obvious (but still required). */
	setInitialDefinition: function() {
		this.def.setInitial();

		return this;
	},
	/**
	Check if this node is a parent of the given node.
	*/
	isParent: function(node) {
		if (typeof(node)=="string")  node = this.net.nodesById[node];

		return node.parents.indexOf(this)!=-1;
	},
	isChild: function(node) {
		return node.isParent(this);
	},
	isLinked: function(node) {
		return this.isParent(node) || this.isChild(node);
	},
	/**
	Check if this node has at least one of the nodes in |nodes| as an ancestor.
	@includeThis: (boolean) Whether to also check if this node is in |nodes|.
	*/
	hasAncestor: function(nodes, includeThis) {
		if (typeof(nodes)!="object" || !('length' in nodes))  nodes = [nodes];
		for (var i=0; i<nodes.length; i++) {
			if (typeof(nodes[i])=="string")  nodes[i] = this.net.nodesById[nodes[i]];
		}

		var toVisit = includeThis ? [this] : this.parents.slice();
		while (toVisit.length) {
			var curNode = toVisit.shift();
			if (nodes.indexOf(curNode)!=-1)  return true;
			toVisit = toVisit.concat(curNode.parents);
		}

		return false;
	},
	/**
	Check if this node has at least on of the nodes in |nodes| as a descendent.
	@includeThis: (boolean) Whether to also check if this node is in |nodes|.
	*/
	hasDescendent: function(nodes, includeThis) {
		if (typeof(nodes)!="object" || !('length' in nodes))  nodes = [nodes];
		for (var i=0; i<nodes.length; i++) {
			if (typeof(nodes[i])=="string")  nodes[i] = this.net.nodesById[nodes[i]];
		}

		var toVisit = includeThis ? [this] : this.children.slice();
		while (toVisit.length) {
			var curNode = toVisit.shift();
			if (nodes.indexOf(curNode)!=-1)  return true;
			toVisit = toVisit.concat(curNode.children);
		}

		return false;
	},
	removeChildRefs(child) {
		let asChildIndex = this.children.findIndex(n => n.id == child.id);
		if (asChildIndex !== -1)  this.children.splice(asChildIndex, 1);
	},
	removeParentRefs(parent) {
		let asParentIndex = this.parents.findIndex(n => n.id == parent.id);
		if (asParentIndex != -1)  this.parents.splice(asParentIndex, 1);
	},
	hasEvidence() {
		return this.id in this.net.evidence;
	},
});

var TextBox = class {
	static DisplayItem = addMixin(this, DisplayItem);
	constructor(o = {}) {
		this._type = "TextBox";

		/// Defaults
		this.id = genPass(10);
		this.submodelPath = [];

		/// Visual properties
		this.constructor.DisplayItem(this);
		this.pos = {x: 0, y: 0};

		this.text = '';

		/// Set options based on constructor args
		Object.assign(this, o);

		this.init(o);
		addDefaultSetters(this);
		addObjectLinks(this);
	}
}
Object.assign(TextBox.prototype, {
	init: function(o) {
		o = o || {};

		if (this.net) {
			this.net.addTextBox(this);

			/// Notify submodel
			this.moveToSubmodel(this.submodelPath);

			/*if (o.addToCanvas) {
				this.net.display();
				this.net.updateAndDisplayBeliefs();
			}*/
		}
	},
	duplicate(extraProps = {}) {
		let newTextBox = new TextBox();

		Object.assign(newTextBox, this, {
			id: genPass(10),
			net: null,
			size: clone(this.size),
			pos: clone(this.pos),
			format: clone(this.format),
		}, pick(extraProps, ...Object.keys(this)));

		if (extraProps.addToNet) {
			this.net.addTextBox(newTextBox);
		}

		return newTextBox;
	},
	delete(o = {submodel: true}) {
		let i = this.net.basicItems.findIndex(item => item.id == this.id);
		if (i != -1)  this.net.basicItems.splice(i,1);
		
		/// Remove reference from submodel
		if (o.submodel) {
			let submodel = this.net.getSubmodel(this.submodelPath);
			let index = submodel.subItems.indexOf(this);
			if (index != -1)  submodel.subItems.splice(index, 1);
		}
	},
	setSubmodelPath: Node.prototype.setSubmodelPath,
	getSubmodelPathStr: Node.prototype.getSubmodelPathStr,
	moveToSubmodel: function(path) {
		var node = this;
		path = BN.makeSubmodelPath(path);

		/// Update old submodel
		let oldSubmodel = this.net.getSubmodel(this.submodelPath);
		if (oldSubmodel) {
			let index = oldSubmodel.subItems.indexOf(this);
			if (index != -1)  oldSubmodel.subItems.splice(index, 1);
		}

		if (path instanceof Submodel) {
			path = path.submodelPath.concat([path.id]);
		}

		/// Save new path
		this.submodelPath = path.slice();

		/// Update new submodel
		let newSubmodel = this.net.getSubmodel(this.submodelPath);
		newSubmodel.subItems.push(this);
	},
	addToNet(net) {
		this.net = net;
		this.init();
		return this;
	},
	rename(nId) {
		this.id = makeValidId(nId);
	},
	renameToUnique: Node.prototype.renameToUnique,
});

var ImageBox = class {
	static DisplayItem = addMixin(this, DisplayItem);
	constructor(o = {}) {
		this._type = "ImageBox";

		/// Defaults
		this.id = genPass(10);
		this.submodelPath = [];

		/// Visual properties
		this.constructor.DisplayItem(this);
		this.pos = {x: 0, y: 0};

		this.imageUrl = '';

		/// Set options based on constructor args
		for (var i in o) {
			this[i] = o[i];
		}

		this.init(o);
		addDefaultSetters(this);
	}
}
/// Almost all the methods are the same as TextBox. Need to refactor
Object.assign(ImageBox.prototype, TextBox.prototype, {
	init: function(o) {
		o = o || {};

		if (this.net) {
			this.net.addImageBox(this);

			/// Notify submodel
			this.moveToSubmodel(this.submodelPath);

			/*if (o.addToCanvas) {
				this.net.display();
				this.net.updateAndDisplayBeliefs();
			}*/
		}
	},
});

var Submodel = class {
	static DisplayItem = addMixin(this, DisplayItem);
	constructor(o = {}) {
		this._type = "Submodel";

		/// Defaults
		this.id = null;
		this.submodelPath = [];
		this.subNodes = [];
		this.submodelsById = {};
		this.subItems = []; /// Any other items
		this.comment = "";

		/// Visual properties
		this.constructor.DisplayItem(this);
		/// For arc drawing/updating
		this.pathsIn = [];
		this.pathsOut = [];

		/// Set options based on constructor args
		if (o instanceof Submodel) {
			this.duplicateFrom(o);
		}
		else {
			Object.assign(this, o);
			
			/// XXX: Implement addToCanvas
			/// XXX: I can't recall what new.target was for
			// if (!o.__noinit && new.target)  this.init({addToCanvas: o.addToCanvas});
			if (!o.__noinit)  this.init({addToCanvas: o.addToCanvas});
		}
	}
}
Object.assign(Submodel.prototype, {
	init(o = {}) {
		if (this.net) {
			if (!this.id) {
				var i = 0;
				while (this.net.submodelsById["submodel"+i]) i++;
				this.id = "submodel"+i;
			}

			/// Add to nets submodels (XXX should this be there?)
			this.net.submodelsById[this.id] = this;
			/// Add to parent submodel
			if (this.submodelPath.length) {
				//this.net.getSubmodel(this.submodelPath).submodelsById[this.id] = this;
				this.moveToSubmodel(this.submodelPath);
			}
		}

		if (!this.id) {
			this.id = genPass(10);
		}
	},
	duplicate(extraProps = {}) {
		let obj = new this.constructor();
		obj.duplicateFrom(this, extraProps);
		return obj;
	},
	duplicateFrom(obj, extraProps = {}) {
		let newSubmodel = this;

		Object.assign(newSubmodel, {
				id: genPass(10),
				net: null,
			}, /// New
			clone(pick(obj, 'size', 'pos', 'format', 'submodelPath')), /// Clone
			pick(obj, 'comment'),  /// Copy
			pick(extraProps, ...Object.keys(obj))); /// Extra

		if (!extraProps.addToNet) {
			/// Retain id, if we're not adding back into this net
			newSubmodel.id = obj.id;
		}

		/// Duplicate all the directly contained items (which may include submodels)
		let newItems = [];
		for (let item of obj.getItems()) {
			let newItem = item.duplicate({submodelPath: [...obj.submodelPath, newSubmodel.id], notFinal: true, ...pick(extraProps,['addToNet'])});
			if (newItem instanceof Submodel) {
				newSubmodel.submodelsById[newItem.id] = newItem;
			}
			else if (newItem instanceof Node) {
				newSubmodel.subNodes.push(newItem);
			}
			else if (newItem instanceof TextBox) {
				newSubmodel.subItems.push(newItem);
			}
			newItems.push(newItem);
			//newItem.moveToSubmodel(newSubmodel);
		}

		/// If this is the last duplicate call
		if (!extraProps.notFinal) {
			/// Get all items from the *original* hierarchy (for checking)
			let newItems = newSubmodel.getAllItems();
			let originalItems = obj.getAllItems();
		
			for (let item of newItems) {
				if (item.children) {
					/// Remove references to children not inside the submodel hierarchy
					let nonMatched = item.children.filter(c => !originalItems.includes(c));
					for (let nonMatchedItem of nonMatched) {
						let index = item.children.indexOf(nonMatchedItem);
						item.children.splice(index,1);
						item.needsCompile = true;
					}
					/// Update all the other node references
					for (let [i,child] of item.children.entries()) {
						let otherItem = newItems.find(item => item.id == child.id);
						if (otherItem) {
							item.children[i] = otherItem;
						}
					}
					for (let [i,parent] of item.parents.entries()) {
						let otherItem = newItems.find(item => item.id == parent.id);
						if (otherItem) {
							item.parents[i] = otherItem;
						}
					}
				}
			}
		}



		if (extraProps.addToNet) {
			obj.net.addSubmodel(newSubmodel);
		}

		return newSubmodel;		
	},
	addToNet(net) {
		this.net = net;
		this.init();

		for (let item of this.getItems()) {
			item.addToNet(net);
		}

		return this;
	},
	find(itemId) {
		if (!itemId)  return undefined;
		if (itemId == "..") {
			return this.getSubmodel(this.submodelPath.slice(0,-1));
		}
		for (let item of this.getItems()) {
			if (item.id == itemId)  return item;
			if (item.find) {
				let subFind = item.find(itemId);
				if (subFind)  return subFind;
			}
		}
		return undefined;
	},
	findItems(type) {
		if (type=='rootNodes') {
			return this.getItems().filter(n => !n.parents.length);
		}
		else if (type=='leafNodes') {
			return this.getItems().filter(n => !n.children.length);
		}
		else if (type=='arcs') {
			return this.getItems().filter(n=>n.isGraphItem()).map(g=>g.pathsIn.map(p=>p.arcSelector)).flat();
		}
		return [];
	},
	/// XXX: Add check for valid id (and use a globally defined regexp for it)
	rename: function(newId) {
		newId = makeValidId(newId);
		if (this.net) {
			var parent = this.net.getSubmodel(this.submodelPath);
			delete parent.submodelsById[this.id];
			parent.submodelsById[newId] = this;
			delete this.net.submodelsById[this.id];
			this.net.submodelsById[newId] = this;
		}
		this.id = newId;
		/// Need to update all items referring to this one
		var allItems = this.getAllItems();
		for (var i=0; i<allItems.length; i++) {
			allItems[i].submodelPath[this.submodelPath.length] = newId;
		}

		return this;
	},
	renameToUnique(o = {}) {
		Node.prototype.renameToUnique.call(this, o);

		for (let item of this.getItems()) {
			let prevId = item.id;
			item.renameToUnique(o);
			if (!this.net) {
				if (item._type == "Submodel") {
					delete this.submodelsById[prevId];
					this.submodelsById[item.id] = item;
				}
			}
		}

		return this;
	},
	/**
	Get all the nodes (and *just* nodes) contained in this and any submodels.
	*/
	getAllNodes: function() {
		var submodelsToVisit = [this];
		var nodes = [];
		while (submodelsToVisit.length) {
			nodes = nodes.concat(submodelsToVisit[0].subNodes);
			for (var i in submodelsToVisit[0].submodelsById) {
				submodelsToVisit.push(submodelsToVisit[0].submodelsById[i]);
			}
			submodelsToVisit.shift();
		}
		return nodes;
	},
	/**
	Get the items that belong to this submodel (but not descendent submodels).
	*/
	getItems: function() {
		var items = [];

		/// nodes
		items = items.concat(this.subNodes);

		/// text items
		items.push(...this.subItems);
		/*for (var i in this.subItems) {
			/// Check if item belongs to this submodel (no shortcut for items, like there is for nodes)
			if (this.net.basicItems[i].submodelPath.join("/") == this.submodelPath.concat([this.id]).join("/")) {
				items.push(this.net.basicItems[i]);
			}
		}*/

		///submodels
		for (var i in this.submodelsById) {
			items.push(this.submodelsById[i]);
		}

		return items;
	},
	/**
	Get all the items (nodes, submodels, text, etc.) in this and any submodels.
	*/
	getAllItems: function() {
		var submodelsToVisit = [this];
		var items = [];
		while (submodelsToVisit.length) {
			items = items.concat(submodelsToVisit[0].getItems());
			/// Visit submodels to add their items
			for (var i in submodelsToVisit[0].submodelsById) {
				submodelsToVisit.push(submodelsToVisit[0].submodelsById[i]);
			}
			submodelsToVisit.shift();
		}
		return items;
	},
	setSubmodelPath: Node.prototype.setSubmodelPath,
	getSubmodelPathStr: Node.prototype.getSubmodelPathStr,
	/// Move this node to the given submodel. |path| is a left-to-right array
	/// representing the path --- or the submodel itself;
	moveToSubmodel: function(path) {
		console.log("path:", path);
		var submodel = this;
		path = BN.makeSubmodelPath(path);

		/// Remove from old submodel (if there)
		var oldSubmodel = this.net.getSubmodel(this.submodelPath);
		/// The top level indexes all submodels, so need to leave it there in that case (FIX)
		if (oldSubmodel && this.submodelPath.length)  delete oldSubmodel.submodelsById[submodel.id];

		/// Save old path
		var oldPath = this.submodelPath.slice();

		if (path instanceof Submodel) {
			path = path.submodelPath.concat([path.id]);
		}

		/// Save new path
		this.submodelPath = path.slice();

		/// Move node to new submodel
		this.net.getSubmodel(this.submodelPath).submodelsById[submodel.id] = submodel;

		/// Move all subitems
		var items = this.getAllItems();
		for (var i=0; i<items.length; i++) {
			var item = items[i];
			item.submodelPath = this.submodelPath.concat(item.submodelPath.slice(oldPath.length));
		}
	},
	/** This will delete the submodel, and all its contents **/
	delete(o = {items: true, submodel: true}) {
		let items = this.getItems();

		if (o.items) {
			for (let item of items) {
				item.delete(o);
			}
		}

		if (o.submodel) {
			/// Delete from parent submodel
			delete this.net.getSubmodel(this.submodelPath).submodelsById[this.id];
			/// Delete from network index of all submodels
			delete this.net.submodelsById[this.id];

			/// Clean up pathsIn/pathsOut for other things
			this.cleanPathsInOut();
		}
	},
	/** This will put all the submodel's contents into the current level first,
		and then delete the submodel container **/
	absorb() {
		let items = this.getItems();

		let deletePoint = this.submodelPath.length;

		for (let item of items) {
			item.moveToSubmodel(this.submodelPath);
		}

		/// Delete from parent submodel
		delete this.net.getSubmodel(this.submodelPath).submodelsById[this.id];
		/// Delete from network index of all submodels
		delete this.net.submodelsById[this.id];

		/// Clean up pathsIn/pathsOut for other things
		this.cleanPathsInOut();
	},
	includes(item) {
		if (item.submodelPath.length <= this.submodelPath.length)  return false;

		for (let i=0; i<this.submodelPath.length; i++) {
			if (item.submodelPath[i]!=this.submodelPath[i])  return false;
		}

		if (item.submodelPath[this.submodelPath.length] == this.id) {
			return true;
		}
		else {
			return false;
		}
	},
	/// Reference management
	removeNodeRefs(node) {
		let index = this.subNodes.findIndex(n => n.id == node.id);
		if (index != -1)  this.subNodes.splice(index, 1);
	},
});

/// An index for naming new BNs
var __newBnIndex = 1;

/// A BN is also a submodel (of course...)
var BN = class extends Submodel {
	constructor(o = {}) {
		console.log("BNINDEX", __newBnIndex);
		/// This implements the 'submodel' interface ({id/node/submodels/pos/size})
		//Submodel.apply(this);
		super(Object.assign({},o,{__noinit:true}));

		/// Format is either 1) specified, 2) given in the file name, or 3) assumed to be an xdsl
		o.format = o.format ?? (o.fileName ? getFileType(o.fileName) : null) ?? "xdsl";

		this.fileName = o.fileName || null;
		this.source = o.source;
		this.sourceFormat = o.format;

		/// Use worker threads to do belief updating?
		this.updateMethod = mbConfig.updateMethod;
		this.useWorkers = mbConfig.useWorkers;
		this._workers = [];
		this.numWorkers = mbConfig.numWorkers;

		this.evidence = {};
		/// This is just saved sets of evidence (or saved scenarios)
		this.evidenceSets = [];

		this.selected = new Set();

		/// Does the cache information need updating?
		this.needsCompile = false;
		/// (To update the net, call the modification functions
		/// (once they're all written!) or change this.objs and then set this.needsCompile.)
		this.nodes = [];
		this.nodesById = {};
		this.basicItems = [];

		/// Various cached information
		this._utilityNodes = [];
		this._decisionNodes = [];
		this._rootNodes = [];
		this._nodeOrdering = [];

		/// GUI-oriented properties
		this.outputEl = null;

		this.currentSubmodel = []; //["Orchard","Tree"];

		this.getRowIInts = new Int32Array(new ArrayBuffer(2*4));

		this._trackingArcInfluences = false;

		//if (!o.__noinit && new.target)  this.init(o);
		if (!o.__noinit)  this.init(o);
		addDefaultSetters(this);
		addObjectLinks(this);
	}
	
	get node() {
		return this.nodesById;
	}
	
	get submodel() {
		return this.submodelsById;
	}
}
/**
The arguments can be: a single string id, a single item object (e.g. Node, Submodel, etc.),
an inline list of ids/objects, or an (arbitrarily nested) array of ids/objects. You can
also mix in undefined and falsy elements, and they will be eliminated from the list.

It *always* returns an array of ids, so that the return is a constant shape. (I had more
complex conditional return previously, but this is more robust/useful.)
*/
BN.getIds = function(...items) {
	let ids = [];
	items = items.filter(item => item);
	for (let item of items) {
		if (Array.isArray(item)) {
			ids.splice(ids.length, 0, ...BN.getIds(...item));
		}
		else {
			ids.push(typeof(item)=="string" ? item : item.id);
		}
	}
	return ids;
};
BN.makeSubmodelPath = function(path) {
	if (Array.isArray(path))  return path;

	if (path.search(/^\//)!==-1) {
		return path.replace(/\/$/,'').split(/\//).slice(1);
	}

	return null;
};
BN.makeSubmodelPathStr = function(pathArr) {
	return pathArr ? '/'+pathArr.concat(['']).join('/') : '';
}
BN.defaultIterations = mbConfig.iterations;
BN.updateMethodTitles = {
	'likelihoodWeighting': 'Likelihood Weighting',
	'junctionTree': 'Junction Tree',
};
BN.sortItems = function(items, sortType) {
	if (sortType == 'original')  return items;
	let sortedItems = null;
	if (sortType == 'idAZ') {
		sortedItems = items.slice().sort((a,b)=>a.id.localeCompare(b.id));
	}
	else if (sortType == 'idZA') {
		sortedItems = items.slice().sort((a,b)=>b.id.localeCompare(a.id));
	}
	else if (sortType == 'labelAZ') {
		sortedItems = items.slice().sort((a,b)=>a.label.localeCompare(b.label));
	}
	else if (sortType == 'labelZA') {
		sortedItems = items.slice().sort((a,b)=>b.label.localeCompare(a.label));
	}
	else if (sortType == 'rootsToLeaves') {
		sortedItems = BN.prototype.topologicalSort(items);
	}
	else if (sortType == 'leavesToRoots') {
		sortedItems = BN.prototype.topologicalSort(items).reverse();
	}
	else if (sortType == 'colorRootsToLeaves') {
		let colorMap = new Map();
		BN.prototype.topologicalSort(items).forEach(n => colorMap.has(n.format.backgroundColor) || colorMap.set(n.format.backgroundColor, colorMap.size));
		sortedItems = items.slice().sort((a,b)=>colorMap.get(a.format.backgroundColor) - colorMap.get(b.format.backgroundColor));
	}
	else if (sortType == 'colorLeavesToRoots') {
		sortedItems = BN.sortItems(items, 'colorRootsToLeaves').reverse();
	}
	return sortedItems;
}
Object.assign(BN.prototype, {
	init: function(o = {}) {
		this.iterations = BN.defaultIterations;
		this.timeLimit = null;
		this.updateViewer = true;
		this.doAutoLayout = false;
		this.perfLoops = 100;
		this.perfIterations = 100000;

		this.fileName = this.fileName || "bn"+(__newBnIndex++)+".xdsl";

		let sourcePromise = null;
		if (this.source) {
			sourcePromise = this["load_"+this.sourceFormat](this.source);
			//debugger;
		}
		
		completeInit = () => {
			if (o.outputEl) {
				this.outputEl = $(o.outputEl);
				this.display();
				/// I was going to pass in BN as an arg,
				/// but I can't because sometimes updateBN is passed,
				/// which expects a callback as its first arg.
				/// That's somewhat nasty.
				if (o.onload)  o.onload();
			}
		}
		
		if (sourcePromise) {
			sourcePromise.then(completeInit);
		}
		else {
			/// Use setTimeout to give other things (like setting currentBn)
			/// a chance to run first
			setTimeout(completeInit, 0);
		}
	},
	load_mb(mbStr) {
		this.objs = JSON.parse(mbStr);
		
		/// |type| could be anything. For now, just throw error if not a BN
		if (this.objs.type !== "BN")  throw new Error("Unknown file type: "+this.objs.type);
		
		this.evidenceSets = this.objs.evidenceSets;
		this.subItems = this.objs.subItems.map(item => new TextBox({...item, net:this}));
		this.nodeDisplayStyle = this.objs.nodeDisplayStyle;
		this.comment = this.objs.comment;
		
		let hasPos = false;
		if (this.objs.nodes) {
			for (let i=0; i<this.objs.nodes.length; i++) {
				let nodeInfo = this.objs.nodes[i];
				let opts = {};
				for (let prop of ["label","parents","format"]) {
					if (prop in nodeInfo) {
						opts[prop] = nodeInfo[prop];
					}
				}
				if (nodeInfo.def) {
					opts.def = new NodeDefinitions[nodeInfo.def.type](null, nodeInfo.def.content);
				}
				if (nodeInfo.position) {
					hasPos = true;
					opts.pos = {x: nodeInfo.position[0], y: nodeInfo.position[1]};
				}
				this.addNode(nodeInfo.id, nodeInfo.states, opts);
			}
		}
		
		/// Update node count, comments, etc. (if present)
		this.compile(true);
		this.updateViewer = true;
		
		if (!hasPos)  this.doAutoLayout = true;
	},
	save_mb() {
		let objs = {type: "BN"};
		
		if (this.nodes.length) {
			objs.nodes = [];
		}
		
		for (let i=0; i<this.nodes.length; i++) {
			let node = this.nodes[i];
			let nodeInfo = {
				id: node.id,
				label: node.label ? node.label : undefined,
				states: node.states ? node.states.map(s => s.id) : undefined,
				parents: node.parents ? node.parents.map(p => p.id) : undefined,
				format: node.format ? node.format : undefined,
			};

			if (node.def) {
				nodeInfo.def = {
					type: node.def.type,
					content: node.def.getContent(),
				};
			}
			if (node.pos) {
				nodeInfo.position = [node.pos.x, node.pos.y];
			}
			objs.nodes.push(nodeInfo);
		}
		
		objs.evidenceSets = this.evidenceSets;
		objs.subItems = this.subItems.map(item => {
			return {
				text: item.text,
				format: item.format,
				pos: item.pos,
				size: item.size,
			};
		});
		objs.nodeDisplayStyle = this.nodeDisplayStyle;
		objs.comment = this.comment;
		
		return JSON.stringify(objs, null, 2);
	},
	loadXml(text) {
		let objs = null;
		
		/** XXX: This is a hack that should be changed at some point! Reasons for this approach:
			- If I leave the namespace as XHTML, it interprets <caption> in a weird way,
			  and removes it from the DOM. The SVG namespace doesn't cause those problems (perhaps
			  others, but haven't encountered any so far).
			- If I parse as XML, it's *way* too fickle/fragile, and throws fatal errors for non-issues
			  like '&nbsp;' not being defined in XML.
			- There's no browser functionality to do a generic HTML-like markup -> DOM,
			  without applying HTML semantics.
		*/
		text = text.replace(/<(\/?)caption>/g, '<$1tempcaption>');
		try {
			/// 2020-10-27: If there's a problem with loading, check this.
			//objs = $($.parseXML(text));
			objs = $(text);
		}
		catch (e) {
			let div = document.createElementNS('http://www.w3.org/1999/xhtml/', 'div');
			//let div = document.createElementNS('http://www.w3.org/2000/svg', 'div');
			//let div = document.createElement('div');
			div.innerHTML = text;
			objs = $(div);
		}
		//console.log(this.objs);
		
		return objs;
	},
	/// All load/save functions for different formats have the format 'load_<format>' or
	/// 'save_<format>'.
	load_xdsl: function(xdsl) {
		/// 2018-03-1 I used to have .find('smile') inside loadXml. I don't seem to need it now...
		this.objs = this.loadXml(xdsl);
	
		var bn = this;
		this.nodes = [];
		this._utilityNodes = [];
		this._decisionNodes = [];
		this.nodesById = {};
		this._rootNodes = [];
		/// Store the submodels information. (These aren't being treated as
		/// truly self-contained models. It would be interesting to do so.)
		this.objs.find("> extensions submodel").each(function() {
			var submodelPars = $(this).parents('submodel').map(function(){ return $(this).attr("id") }).toArray().reverse();

			/// Navigate to the parent submodel
			var parSubmodel = bn.getSubmodel(submodelPars);

			var posInfo = $(this).find("> position").text().split(/\s+/);
			console.log(posInfo);
			/// This has been copied from the equivalent code in makeNodeFromXdsl. Need to merge them.
			var $extInfo = $(this);
			var format = {};
			let label = null;
			if ($extInfo.find("> name")) {
				label = $extInfo.find("> name").text();
			}
			if ($extInfo.find("> interior")) {
				format.backgroundColor = '#'+$extInfo.find("> interior").attr("color");
			}
			if ($extInfo.find("> outline")) {
				format.borderColor = '#'+$extInfo.find("> outline").attr("color");
			}
			if ($extInfo.find("> font")) {
				format.fontColor = '#'+$extInfo.find("> font").attr("color");
				format.fontFamily = $extInfo.find("> font").attr("name");
				format.fontSize = $extInfo.find("> font").attr("size");
			}
			/// Detect default colors, and remove them if present
			/// XXX: Ideally, these would just be indicated by absence, but GeNIe forces them
			if (format.backgroundColor == '#e5f6f7' && format.borderColor == '#0000bb' && format.fontColor == '#000000') {
				format.backgroundColor = null;
				format.borderColor = null;
				format.fontColor = null;
			}
			if (format.fontFamily == 'Arial' && format.fontSize == '8') {
				format.fontFamily = null;
				format.fontSize = null;
			}
			parSubmodel.submodelsById[$(this).attr("id")] = new Submodel({
				id: $(this).attr("id"),
				label: label,
				submodelPath: submodelPars,
				net: bn,
				subNodes: [],
				submodelsById: {},
				pos: {x: Number(posInfo[0]), y: Number(posInfo[1])},
				size: {width: Number(posInfo[2])-Number(posInfo[0]), height: Number(posInfo[3])-Number(posInfo[1])},
				format: format,
			});
		});

		/// Handle all the nodes
		this.objs.find("> nodes cpt, > nodes deterministic, > nodes decision, > nodes utility, > nodes equation, > nodes noisymax").each(function() {
			var node = Node.makeNodeFromXdslEl(this, bn.objs, {net: bn});
			//node.moveToSubmodel(node.submodelPath);
			//bn.nodes.push(node);
			//bn.nodesById[node.id] = node;
			//if ($(this).is("utility")) {
			//	bn._utilityNodes.push(node);
			//}
			//else if ($(this).is("decision")) {
			//	bn._decisionNodes.push(node);
			//}
			//onsole.debug(bn.nodes);
		});

		/// Handle textboxes
		this.objs.find("> extensions textbox").each(function() {
			var submodelPars = $(this).parents('submodel').map(function(){ return $(this).attr("id") }).toArray().reverse();
			var posInfo = $(this).find("position").text().split(/\s+/);
			let text = $(this).find("tempcaption")[0].textContent ?? '';
			text = text.replace(/\\n/g, '\n');
			console.log("textbox", text);
			var textBox = new TextBox({
				net: bn,
				pos: {x: Number(posInfo[0]), y: Number(posInfo[1])},
				size: {width: Number(posInfo[2])-Number(posInfo[0]), height: Number(posInfo[3])-Number(posInfo[1])},
				submodelPath: submodelPars,
				/// The parse interprets the <caption> element in a unique way, converting it to a text node...
				text,
			});
			var format = textBox.format;
			var $font = $(this).find("font");
			if ($font.length) {
				format.fontColor = '#'+$font.attr("color");
				format.fontFamily = $font.attr("name");
				format.fontSize = $font.attr("size");
				format.bold = $font.attr("bold") && $font.attr("bold").toLowerCase()=="true";
				format.italic = $font.attr("italic") && $font.attr("italic").toLowerCase()=="true";
				format.align = $font.attr("align");
			}
		});

		if (this._decisionNodes.length) {
			$(".decisionNet").css('display', 'inline');
		}
		else {
			$(".decisionNet").hide();
		}

		/*this.objs.find("> nodes utility").each(function() {
			var node = Node.makeNodeFromXdslEl(this, bn.objs);
			/// Keep utility nodes separate from the nodes involved in inference
			bn._utilityNodes.push(node);
			/// Just add to the standard node index
			bn.nodesById[node.id] = node;
		});*/

		/// Augment the nodes with any dynamic nodes (including unrolled nodes...)
		this.objs.find("> dynamic").each(function() {
			var $dyn = $(this);
			numSlices = $dyn.attr("numslices");
			///Override with 10 (why did I have this here?)
			//numSlices = 10;
			var sliceNum = 1;

			for (; sliceNum<numSlices; sliceNum++) {
				function updateParentNames(node) {
					var pars = node.parents;
					for (var pi=0; pi<pars.length; pi++) {
						/// Parent may have already been converted to a node
						if (typeof(pars[pi])!=="string")  pars[pi] = pars[pi].id;
						var parentId = pars[pi];
						var parentSlice = sliceNum-node.dbnOrder;
						if (parentSlice!=0) {
							node.parents[pi] = parentId +"_"+(sliceNum-node.dbnOrder);
						}
					}
				}

				/// Create a copy of all order 0 nodes for all slices
				bn.objs.find("> nodes cpt, > nodes deterministic, > nodes decision, > nodes utility").each(function() {
					var node = Node.makeNodeFromXdslEl(this, bn.objs, {engineOnly:true});
					if (!$dyn.find(`#${node.id}`).length) {
						node.id = node.id +"_"+ sliceNum;
						node.net = bn;
						node.slice = sliceNum;
						console.log(node.id, sliceNum);
						//bn.nodes.push(node);
						//bn.nodesById[node.id] = node;
						updateParentNames(node);
						node.init();
						//onsole.debug(bn.nodes);
					}
				});

				/// Create a copy of all higher order nodes for all slices
				$dyn.find("> cpt, > deterministic, > nodes decision, > nodes utility").each(function() {
					var tempNode = Node.makeNodeFromXdslEl(this, bn.objs, {engineOnly:true});
					var origNode = bn.nodesById[tempNode.id];
					tempNode.id = tempNode.id+"_"+sliceNum;

					/// If we've seen enough slices to accommodate the node's DBN order,
					/// start including the node in network
					if (sliceNum >= tempNode.dbnOrder) {
						/// Merge in parents for this slice
						updateParentNames(tempNode);
						tempNode.parents = origNode.parents.map(p => `${p.id}_${sliceNum}`).concat(tempNode.parents);
						console.log(tempNode.parents);
						tempNode.net = bn;
						tempNode.init();
					}
				});
			}

		});

		/// Store the parents/order of all dynamic nodes (useful for display)
		this.objs.find("> dynamic > cpt").each(function() {
			var node = bn.nodesById[$(this).attr("id")];
			var parentNames = $(this).find("parents").text().split(/\s+/);
			for (var pi=0; pi<parentNames.length; pi++) {
				node.dynamicParents.push( [bn.nodesById[parentNames[pi]], Number($(this).find("cpt").attr("order")) ] );
			}
		});

		/// Get stored scenarios
		this.objs.find("> extensions > make-believe > evidence-sets > evidence").each(function() {
			bn.evidenceSets.push(JSON.parse($(this).text()));
		});

		this.objs.find("> extensions > genie > comment").each(function() {
			bn.comment = $(this).text();
			/// Replace '\n' with a newline
			bn.comment = bn.comment.replace(/\\n/g, '\n');
		});
		/// Update node count, comments, etc. (if present)
		bn.updateViewer = true;

		this.compile(true);
	},
	/// There is very minimal support for loading a .dne file at this stage. It should
	/// work with any basic network, that just has discrete variables and arcs and nothing much more.
	/// The plan is to support some extra features (possibly DBNs and continuous variables), but these
	/// ideas will be translated into whatever is most natural in the typical Make-Believe context.
	load_dne: function(dneText) {
		var bn = this;
		//parsing_debug(true);
		console.time('parsing');
		var grammar = new Grammar($('.dneGrammar')[0].textContent);
		//onsole.log(dneText);
		window.globalDneText = dneText;
		var om = grammar.createTree(dneText);
		window.globalOm = om;
		console.timeEnd('parsing');
		console.time('searching');
		//onsole.log(om);
		var bnet = om._findObject({type: 'BLOCK_STATEMENT', children: {0: 'bnet'}});
		var comment = bnet._findObject({children: {0: "comment", 2: {children: {0: OBJECTVALUE}}}}, {recursive: false});
		if (comment) {
			/// Strip out all end of line slashes (plus following whitespace)
			comment = comment.replace(/\\\r?\n\s*/g, '');
			/// Replace '\n' with a newline
			comment = comment.replace(/\\n/g, '\n');
			bn.comment = comment;
		}
		//var bnet = JSON.search(om, '//*[type="BLOCK_STATEMENT"][children[1]="bnet"]')[0];
		//onsole.log(bnet);
		console.time('find nodes');
		var nodes = bnet._findObjects({type: 'BLOCK_STATEMENT', children: {0:'node'}});
		console.timeEnd('find nodes');
		console.log(nodes);
		//var nodes = JSON.search(bnet, '//*[type="BLOCK_STATEMENT"][children[1]="node"]');
		for (var ni=0; ni<nodes.length; ni++) {
			let size = {width: 80, height: 30};
			var omNode = nodes[ni];
			var nodeId = omNode.children[1];
			var isTextNode = false;
			console.log(nodeId, omNode);
			/// ASSUME represents a text node?
			/// I didn't save a test case for this, and can't replicate.
			var skipNode = false;
			try {
				skipNode = omNode._findObject({children: {0: "kind", 2: {children: {0: "ASSUME"}}}});
				//skipNode = JSON.search(omNode, '//*[children[1]="kind"]/children[3]/children')[0]=="ASSUME";
			}
			catch (e) { skipNode = true; }
			if (skipNode)  continue;
			/// Try to find the visual position. If none has been specified, just assign 0,0.
			var centerPos = [0,0];
			try {
				//console.log( omNode._findObject({children: {0: "center", 2: {children: {0: OBJECTVALUE}}}}) );
				centerPos = omNode._findObject({children: {0: "center", 2: {children: {0: OBJECTVALUE}}}}).replace(/[\(\)\s]/g, '')._splitNotEmpty(/,/);
				//centerPos = JSON.search(omNode, '//*[children[1]="center"]/children[3]/children')[0].replace(/[\(\)\s]/g, '')._splitNotEmpty(/,/);
			}
			catch (e) {}
			var states = omNode._findObject({children: {0: "states", 2: {children: {0: OBJECTVALUE}}}});
			var stateTitles = omNode._findObject({children: {0: "statetitles", 2: {children: {0: OBJECTVALUE}}}});
			if (states || stateTitles) {
				/// Make-believe doesn't currently support state labels (although, it's
				/// almost the very next thing to go in)
				if (states) {
					states = states.replace(/[\(\)\s]/g, '')._splitNotEmpty(/,/);
				}
				else if (stateTitles) {
					states = [];
					stateTitles.replace(/"((?:\\.|[^"])*)"/g, (m,p1) => states.push(p1.replace(/\\(.)/g, '$1')));
					//states = stateTitles.replace(/[\(\)\s]/g, '')._splitNotEmpty(/,/);
				}
			}
			else {
				var levels = omNode._findObject({children: {0: "levels", 2: {children: {0: OBJECTVALUE}}}});
				if (levels) {
					levels = levels.replace(/[\(\)\s]/g, '')._splitNotEmpty(/,/);
					states = [];
					for (var li=0; li<levels.length-1; li++) {
						states.push(levels[li]+"_"+levels[li+1]);
					}
				}
				else {
					console.log("Could not find states or levels for '"+nodeId+"' node. Skipping.");
					isTextNode = true;
					//continue;
				}
			}
			//var states = JSON.search(omNode, '//*[children[1]="states"]/children[3]/children')[0].replace(/[\(\)\s]/g, '')._splitNotEmpty(/,/);
			if (!isTextNode) {
				states = states.map(function(x,i){ return new State({id: x, index: i}) });
				var cpt = null;
				var funcTable = null;
				try {
					var cptStr = omNode._findObject({children: {0: "probs", 2: {children: {0: OBJECTVALUE}}}});
					if (cptStr) {
						//var cptStr = JSON.search(omNode, '//*[children[1]="probs"]/children[3]/children')[0];
						/// defiantjs converts all new lines to &#13;, presumably for xpath compatibility
						cptStr = cptStr.replace(/&#13;/g, '\n');
						/// Remove all comments
						cptStr = cptStr.replace(/\/\/.*/g, '');
						/// XXX Need to do more to support the various types of .dne 'probs' formats
						//onsole.log( cptStr );
						cpt = cptStr.replace(/[\(\)\s\n\r]|&[^&;]+;/g, '')._splitNotEmpty(/,/);
					}
					else {
						var funcTableStr = omNode._findObject({children: {0: "functable", 2: {children: {0: OBJECTVALUE}}}});
						if (funcTableStr) {
							/// Remove all comments
							funcTableStr = funcTableStr.replace(/\/\/.*/g, '');
							/// XXX Need to do more to support the various types of .dne 'probs' formats
							//onsole.log( funcTableStr );
							funcTable = funcTableStr.replace(/[\(\)\s\n\r]|&[^&;]+;/g, '')._splitNotEmpty(/,/);
							funcTable = funcTable.map(stateName => states.findIndex(s => s.id==stateName));
						}
					}
				}
				catch (e) {}
				var comment = null;
				try {
					//comment = JSON.search(omNode, '//*[children[1]="comment"]/children[3]/children')[0];
					comment = omNode._findObject({children: {0: "comment", 2: {children: {0: OBJECTVALUE}}}});
				}
				catch (e) {}
			}
			/// Font
			let fontStatement = omNode._findObject({type: 'ASSIGN_STATEMENT', children:{0:'font'}});
			let format = {};
			if (fontStatement) {
				let fontFamily = fontStatement._findObject({0:'shape', 2:{children:{0:OBJECTVALUE}}});
				let fontSize = fontStatement._findObject({0:'size', 2:{children:{0:OBJECTVALUE}}});
				format.fontFamily = fontFamily;
				format.fontSize = fontSize;
			}
			var label = null;
			try {
				//label = JSON.search(omNode, '//*[children[1]="title"]/children[3]/children')[0];
				label = omNode._findObject({children: {0: "title", 2: {children: {0: OBJECTVALUE}}}});
				label = label.replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
			}
			catch (e) {}
			//onsole.log("TITLE:", label);
			console.log("CPT:", cpt);
			if (isTextNode) {
				new TextBox({
					net: this,
					text: label,
					pos: {x: Number(centerPos[0]), y: Number(centerPos[1])},
					/// Netica comments have no width property.
					size: {width: null, height: 30},
				});
			}
			else {
				let def = null;
				if (funcTable !== null) {
					def = new CDT(null, funcTable);
				}
				else {
					def = new CPT(null, cpt);
				}
				var node = new Node({
					net: this,
					id: nodeId,
					label: label,
					//parents: JSON.search(omNode, '//*[children[1]="parents"]/children[3]/children')[0].replace(/[\(\)\s]/g, '')._splitNotEmpty(/,/),
					parents: omNode._findObject({children: {0: "parents", 2: {children: {0: OBJECTVALUE}}}}).replace(/[\(\)\s]/g, '')._splitNotEmpty(/,/),
					states: states,
					def: def,
					pos: {x: Number(centerPos[0]), y: Number(centerPos[1])},
					size: size,
					format: format,
					comment: comment,
				});
				/// Check for any empty CPTs, and set to a useful initial
				//if (!cpt)  node.def.setInitial();
			}
		}
		/// Colour in the nodes
		let bnVisual = bnet._findObject({type: 'BLOCK_STATEMENT', children: {0:'visual'}});
		let nodeSets = bnet._findObjects({type: 'BLOCK_STATEMENT', children: {0:'NodeSet'}}).filter(o => o._findObject({0:'Nodes'}));
		for (let nodeSet of nodeSets) {
			let nodeSetName = nodeSet.children[1];
			let nodeList = nodeSet._findObject({type: 'ASSIGN_STATEMENT', children: {0:'Nodes'}});
			let nodeListStr = nodeList.children[2].children[0];
			if (nodeListStr!='()') {
				let nodeIds = nodeListStr.replace(/\(|\)/g, '').split(/\s*,\s*/);
				let nodeColorInfo = bnVisual._findObject({type: 'BLOCK_STATEMENT', children: {0:'NodeSet', 1:nodeSetName, 2:OBJECTVALUE}});
				let color = nodeColorInfo._findObject({type: 'ASSIGN_STATEMENT', children:{0:'Color',2:{children:{0:OBJECTVALUE}}}});
				for (let nodeId of nodeIds) {
					console.log(nodeId);
					if (nodeId)  bn.find(nodeId).format.backgroundColor = color.replace(/^0x00/, '#');
				}
				console.log(color);
			}
		}
		console.timeEnd('searching');
		console.time('compiling');
		this.compile(true);
		console.timeEnd('compiling');

		/// Update node count, comments, etc. (if present)
		bn.updateViewer = true;
		
		let hasPos = false;
		for (let node of bn.nodes) {
			hasPos = hasPos || node.pos.x!=0 || node.pos.y!=0;
			console.log(hasPos, node.pos.x, node.pos.y);
			if (hasPos)  break;
		}
		if (!hasPos)  bn.doAutoLayout = true;
	},
	save_dne() {
		let nodesStr = '';
		
		function encodeDneString(inStr) {
			let hasSpecial = false;
			for (let i=0; i<inStr.length; i++) {
				if (inStr[i].codePointAt(0) >= 256) {
					hasSpecial = true;
					break;
				}
			}
			if (!hasSpecial)  return inStr;
			
			let str = '\\FF\\FE';
			
			function handle16Bit(code) {
				let str = "";
				if (code < 256) {
					str = '\\'+code.toString(16).toUpperCase()+'\\00';
				}
				else if (code < 65536) {
					str = code.toString(16).replace(/(..)(..)/, '\\$2\\$1').toUpperCase();
				}
				return str;
			}
			
			for (let i=0; i<inStr.length; i++) {
				let code = inStr[i].codePointAt(0);
				if (code < 65536) {
					str += handle16Bit(code);
				}
				else {
					/// Netica handles 32 bit unicode a little oddly, I think.
					let code1 = inStr[0].charCodeAt(0);
					let code2 = inStr[0].charCodeAt(1);
					str += handle16Bit(code2);
					str += handle16Bit(code1);
				}
			}
			
			return str;
		}
		
		let nodeIds = {};
		function uniqueNodeId(id) {
			let newId = makeValidId(id);
			while (newId in nodeIds) {
				let m = newId.match(/_(\d+)/);
				if (!m) {
					newId = newId.substring(0,28)+'_1';
				}
				else {
					newId = newId.substring(0,30-m[0].length)+'_'+(Number(m[1])+1);
				}
			}
			nodeIds[newId] = true;
			return newId;
		}
		
		let nodeIdMap = {};
		for (let node of this.nodes) {
			nodeIdMap[node.id] = uniqueNodeId(node.id);
		}
		
		let maxX = 0;
		let maxY = 0;
		for (let node of this.nodes) {
				let title = node.label ? encodeDneString(node.label) : null;
				
				maxX = Math.max(maxX, node.pos.x+node.size.width);
				maxY = Math.max(maxY, node.pos.y+node.size.height);
			
				let s = '';
				s += `\tkind = ${node.type.toUpperCase()};\n`;
				s += `\tdiscrete = TRUE;\n`;
				s += `\tchance = ${node.def.type=="CPT" ? "CHANCE" : "DETERMIN"};\n`;
				s += `\tstates = (${node.states.map(s => makeValidId(s.id)).join(',')});\n`;
				s += `\tstatetitles = (${node.states.map(s => '"'+encodeDneString(s.id)+'"').join(',')});\n`;
				s += `\tparents = (${node.parents.map(p => nodeIdMap[p.id]).join(',')});\n`;
				if (node.def.type == 'CPT') {
					let tempDef = new CPT(node.def);
					/// We want normal JS numbers, rather than float32s
					tempDef.cpt = [...tempDef.cpt];
					tempDef.normalize(6);
					s += `\tprobs = (${tempDef.cpt.join(",")});\n`;
				}
				else if (node.def.type == 'CDT') {
					s += `\tfunctable = (${[...node.def.funcTable].map(v => '#'+v).join(",")});\n`;
					console.log(`\tfunctable = (${node.def.funcTable.map(v => '#'+v).join(",")});\n`);
				}
				if (title)  s += `\ttitle = "${title}";\n`;
				
				let visual = '\tvisual V1 {\n';
				visual += `\t\tcenter = (${Math.round(node.pos.x)},${Math.round(node.pos.y)});\n`;
				visual += '\t};\n';
			
				let nodeStr = `node ${nodeIdMap[node.id]} {\n${s}\n${visual}\n};\n\n`;
				
				nodesStr += nodeStr;
		}
		
		
		let fullStr = `// ~->[DNET-1]->~

// File created by user using Make-Believe on ${new Date()}.

bnet ${makeValidId(this.fileName.replace(/\.[^.]*$/, ''))} {
	
visual V1 {
	drawingbounds = (${Math.round(maxX)},${Math.round(maxY)});
};

${nodesStr}

};
`;
		return fullStr;
	},
	async load_cmp(cmpText) {
		let jsZip = new JSZip();
		let zip = await jsZip.loadAsync(cmpText);
		let contents = null;
		
		for (let file of Object.values(zip.files)) {
			if (file.name.search(/_model\.xml$/)!=-1) {
				contents = await file.async("string");
				break;
			}
		}
		
		/// Now we have the model contents, extract the model(s)
		this.objs = this.loadXml(contents);
		
		let ebn = this.objs.find('extendedBN').eq(0);
		let ebnId = ebn.attr('id');
		let eNodes = ebn.find('extended_node');
		let coreFn = ebn.find('conn_core_filename').eq(0).text();
		let diagramFn = coreFn.replace(/\.cor$/, '.dgm');
		
		let nodes = [];
		let nodesByAgenaId = {};
		let nodesById = {};
		for (let eNode of eNodes) {
			let node = new Node({
				net: this,
				id: $(eNode).find('conn_node_id').eq(0).text(),
				label: $(eNode).find('> name > short_description').eq(0).text(),
			});
			nodes.push(node);
			nodesById[node.id] = node;
			nodesByAgenaId[$(eNode).attr('id')] = node;
		}
		console.log(nodes.map(n => n.id));
		
		/// Now we need to update the nodes with visual information, which is in another file
		/// in a relatively cryptic format
		/// Won't have the same index as the .cor file. No, that would
		/// be way too easy.
		//contents = await zip.file(diagramFn).async("string");
		for (let file of Object.values(zip.files)) {
			if (file.name.search(/\.dgm$/)!=-1) {
				console.log(file.name);
				contents = await file.async("string");
				let m = contents.match(/^uk\.co\.agena\.minerva\.model\.extendedbn\.ExtendedBN=([\d\w]+)/m);
				console.log(m,ebnId);
				/// We found the right file, so break
				if (m && m[1]==ebnId) {
					console.log('found');
					break;
				}
				contents = '';
			}
		}
		
		console.log(contents);
		
		/// contents contains the visual information. Extract.
		// /^uk\.co\.agena\.minerva\.guicomponents\.diagramcanvas\.CanvassLabel.*(?:LabelledEN|BooleanEN)=(\d+)[^~]*\d+=([\d.]+),([\d.]+)/gm
		contents.replace(/^uk\.co\.agena\.minerva\.guicomponents\.diagramcanvas\.CanvassLabel.*(?:LabelledEN|BooleanEN)=(\d+)[^~]*~\d+=([\d.]+),([\d.]+)/gm, function(m, id, x, y) {
			console.log('xxxxxxxxxxxxx',m, id, x, y);
			nodesByAgenaId[id].pos.x = Number(x);
			nodesByAgenaId[id].pos.y = Number(y);
			return m;
		});
		
		/*for (let file of Object.values(zip.files)) {
			if (file.name.search(/.cor$/)!=-1) {
				console.log(file.name);
				contents = await file.async("string");
			}
		}*/
		
		contents = await zip.file(coreFn).async("uint8array");
		//console.log(contents);
		let gunz = new Zlib.Gunzip(contents);
		contents = gunz.decompress();
		console.log(contents);
		contents = new buffer.Buffer(contents);
		let jdContents = new JavaDeserializer(contents).contents;
		
		let jNodes = jdContents[0].nodeList['@'].slice(1);
		for (let jNode of jNodes) {
			let node = nodesById[jNode.altId];
			let tableNodes = jNode.nodes4table['@'].slice(1);
			
			node.setStates(jNode.stateLabels);
			/// Add all parents from nodes4Table
			//let parentEdges = jNode.originalEdges['@'].slice(1).filter(e => e.edgeDirection == 1);
			for (let tNode of tableNodes) {
				if (tNode.altId == jNode.altId)  continue;
				node.addParents([nodesById[tNode.altId]]);
			}
			let oldCpt = jNode.condProbsLinear;
			/// grr num 2. CPTs can be 'compressed' (basically, sparse CPTs).
			/// missing entries are 0
			
			if (jNode.condProbIsCompressed) {
				oldCpt = new Float32Array(new ArrayBuffer(4*jNode.totalNumberOfConditionalProbabilities));
				for (let entry of jNode.condProbCompressedIndexVal) {
					let index = entry[0];
					let prob = entry[1];
					oldCpt[index] = prob;
				}
			}
			let fixedCpt = new Float32Array(new ArrayBuffer(4*oldCpt.length));
			let numStates = node.states.length;
			let numRows = oldCpt.length/numStates;
			/// grr, the table is not formatted in the order of entry. It's formatted like a factor,
			/// with the current node in a seemingly arbitrary column position
			let currentNodeFound = false;
			let nodesToLeftSize = 1;
			let nodesToRightSize = 1;
			for (let tNode of tableNodes) {
				if (currentNodeFound) {
					nodesToRightSize *= tNode.stateLabels.length;
				}
				else {
					if (tNode.altId == jNode.altId) {
						currentNodeFound = true;
					}
					else {
						nodesToLeftSize *= tNode.stateLabels.length;
					}
				}
			}
			
			for (let i=0; i<oldCpt.length; i++) {
				let leftGroup = Math.floor(i/(numStates*nodesToRightSize));
				let leftGroupI = leftGroup*(numStates*nodesToRightSize);
				let state = Math.floor(i/nodesToRightSize)%numStates;
				let rightGroupOffset = i%(nodesToRightSize)*numStates;
				newI = leftGroupI + rightGroupOffset + state;
				fixedCpt[newI] = oldCpt[i];
			}
			
			/*for (let r=0; r<numRows; r++) {
				for (let s=0; s<numStates; s++) {
					s*nodesToRightSize
					fixedCpt[r*numStates + s] = oldCpt[s*numRows + r];
				}
			}*/
			let cpt = new CPT(node, fixedCpt);
			/// Normalise
			cpt.normalize();
			
			//debugger;
			node.def = cpt;
		}
		
		/// Fix node ids
		for (let node of this.nodes) {
			node.rename(node.id.replace(/\s/g, '_'));
		}
		
		this.compile(true);
		this.updateViewer = true;
	},
	load_claimsCsv(text) {
		let claims = readCsv(text);
		console.log(claims);
		let sources = [];
		let values = {}
		for (let claim of claims) {
			/// Carry forward empty values
			Object.assign(values, Object.fromEntries(Object.entries(claim).filter(([k,v]) => v)));
			if (claim.Source)  sources.push(claim.Source);
			if (values.Relationship == '->') {
				let v1 = makeValidId(values.Variable1);
				let v2 = makeValidId(values.Variable2);
				if (!currentBn.nodesById[v1])  currentBn.addNode(v1, null, {label: values.Variable1});
				if (!currentBn.nodesById[v2])  currentBn.addNode(v2, null, {label: values.Variable2});
				currentBn.nodesById[v1].addChildren([v2], {noUpdate:true});
			}
		}
		currentBn.addTextBox(sources.join('\n'), {pos: [20, 20]});
		currentBn.display();
		app?.autoLayout?.();
	},
	updateNodeReferences() {
		var bn = this;
		/// Replace references to parent ids, with references to node cache
		/// and index each node''s children
		/// The var i in bn.nodes approach causes a 4x slowdown in inference!
		/// Presumably because intId can't be pegged as an int.
		/// Update: I later learnt for x in arr forces x to always be a string
		/// based on the JS specification. Odd.
		for (var i=0; i<bn.nodes.length; i++) {
		//for (var i in bn.nodes) {
			var node = bn.nodes[i];
			/// For fast referencing (without going to a dict lookup)
			node.intId = i;
			for (var j=0; j<node.parents.length; j++) {
				if (typeof(node.parents[j])==="string") {
					//onsole.log(node.parents, j, node.parents[j]);
					node.parents[j] = bn.nodesById[node.parents[j]];
					node.parents[j].children.push(node);
				}
			}
			node.statesById = {};
			for (var j=0; j<node.states.length; j++) {
				node.statesById[node.states[j].id] = node.states[j];
			}
			//onsole.log(node._name, node);
		}
	},
	/** After basic loading, need to run various cleanups, replace named objects with object points,
		store things in more optimised form, etc.

		This is now basically a compile function. Update: Hence why it's now called 'compile'. :)
		**/
	compile(force) {
		if (!force && !this.needsCompile)  return;
		console.log('Compiling...');

		var bn = this;
		
		this.updateNodeReferences();
		this.updateRootNodes();
		this.updateNodeOrdering();

		/* Compile the definitions (independently of whether workers are being used,
			just in case we don't use workers. */
		for (var node of bn.nodes) {
			if (node.def) {
				node.def.compile({force});
			}
		}

		/// Determine the update method
		let updateMethod = this.updateMethod;
		if (this.updateMethod == 'autoSelect') {
			updateMethod = this.nodes.some(n => n.def.type != 'CPT' && n.def.type != 'CDT') ? 'likelihoodWeighting' : 'junctionTree';
		}
		this.updateMethodActual = updateMethod;

		let compileMethod = 'compile_'+this.updateMethodActual;
		if (this[compileMethod])  this[compileMethod]();

		this.needsCompile = false;
	},
	compile_off() {
		// pass
	},
	compile_likelihoodWeighting() {
		if (this.useWorkers) {
			console.log('Using workers');
			var numWorkers = this.numWorkers;

			/// Make the workers and store the BN just once
			if (this._workers.length != numWorkers) {
				this._workers = new Array(numWorkers);
			}
			for (var wi=0; wi<numWorkers; wi++) {
				if (!this._workers[wi])  this._workers[wi] = new Worker("_/js/beliefUpdate_worker.js");
				let bnToPass = makeBnForUpdates(this, true);
				try {
					console.log("BNTOPASS:", bnToPass);
					//onsole.log(problemWithObjectClone(bnToPass));
					this._workers[wi].postMessage([0, bnToPass]);
				}
				catch (e) {
					if (e.name == "DataCloneError") {
						console.log(problemWithObjectClone(bnToPass));
						throw e;
					}
					else { throw e; }
				}
			}
		}
	},
	compile_junctionTree() {
		if (this.useWorkers) {
			this._workers = [new Worker("_/js/junctionTree_worker.js")];
			let bnToPass = makeBnForUpdates(this, true);
			try {
				//onsole.log("BNTOPASS:", bnToPass);
				//onsole.log(problemWithObjectClone(bnToPass));
				this._workers[0].postMessage([0, bnToPass]);
			}
			catch (e) {
				if (e.name == "DataCloneError") {
					console.log(problemWithObjectClone(bnToPass));
					throw e;
				}
				else { throw e; }
			}
		}
		else {
			let jtree = new JunctionTree(makeBnForUpdates(this));
			console.time('compile');
			jtree.compile();
			console.timeEnd('compile');
			this.jtree = jtree;
		}
	},
	updateRootNodes: function() {
		var bn = this;
		/// Cache root nodes
		bn._rootNodes = [];
		for (var i in bn.nodes) {
			var node = bn.nodes[i];
			//onsole.log(node.parents.length, node);
			if (node.parents.length == 0) {
				bn._rootNodes.push(node);
			}
		}
	},
	updateNodeOrdering: function() {
		var bn = this;

		console.log(bn.nodes.length, bn._rootNodes);

		/// Create copies of all the arcs to work with
		function arcCopies(node) {
			node._tempParents = node.parents.slice();
		}
		for (var i=0; i<bn.nodes.length; i++)  arcCopies(bn.nodes[i]);

		/// Create a node ordering that can be used to generate cases quickly (from roots down)
		var q = bn._rootNodes.slice();
		var no = [];
		for (var i=0; i<q.length; i++) {
			var node = q[i];
			no.push(node);
			for (var j=0; j<node.children.length; j++) {
				var allParentsRemoved = true;
				for (var k=0; k<node.children[j]._tempParents.length; k++) {
					if (node.children[j]._tempParents[k] == node) {
						node.children[j]._tempParents[k] = null;
					}
					if (node.children[j]._tempParents[k] != null) {
						allParentsRemoved = false;
					}
				}
				if (allParentsRemoved) {
					q.push(node.children[j]);
				}
			}
		}
		this._nodeOrdering = q;

		/// Remove all the temporary arcs
		for (var i=0; i<bn.nodes.length; i++)  delete bn.nodes[i]._tempParents;

		console.log("nodeOrdering:", this._nodeOrdering.length);
	},
	/// Returns an xdsl string
	save_xdsl: function() {
		var bn = this;
		/// Topological, because GeNIe can be fussy about this
		var sortedNodes = this.topologicalSort(this.nodes);

		var $smile = $("<smile version='1.0' id='sub0'>")
			/// XXX Clarify the difference btw numsamples/discsamples
			.attr("numsamples", this.iterations)
			.attr("discsamples", this.iterations);
		$smile.append("<nodes>");
		for (var i=0; i<sortedNodes.length; i++) {
			var node = sortedNodes[i];
			if (node.type=="nature") {
				if (node.def.cpt) {
					var $el = null;
					$smile.find("> nodes").append(
						$el = $("<cpt>").attr("id", node.id)
					);
					(function(){
					for (var i=0; i<node.states.length; i++) {
						var $state = $("<state>").attr("id", node.states[i].id);
						$el.append($state);
					}
					var $parents = $("<parents>");
					var p = "";
					for (var i=0; i<node.parents.length; i++) {
						p += (i!=0?" ":"") + node.parents[i].id;
					}
					if (p!=="")  $el.append($parents.text(p));
					$el.append(
						$("<probabilities>").text(Array.prototype.slice.call(node.def.cpt).join(" "))
					);
					})();
				}
				else if (node.def.funcTable) {
					var $el = null;
					$smile.find("> nodes").append(
						$el = $("<deterministic>").attr("id", node.id)
					);
					(function(){
					for (var i=0; i<node.states.length; i++) {
						var $state = $("<state>").attr("id", node.states[i].id);
						$el.append($state);
					}
					var $parents = $("<parents>");
					var p = "";
					for (var i=0; i<node.parents.length; i++) {
						p += (i!=0?" ":"") + node.parents[i].id;
					}
					if (p!=="")  $el.append($parents.text(p));
					$el.append(
						$("<resultingstates>").text(Array.prototype.slice.call(node.def.funcTable).map(function(s){return node.states[s].id;}).join(" "))
					);
					})();
				}
				else if (node.def.type == 'Equation') {
					let $el = null;
					$smile.find("> nodes").append(
						$el = $("<equation>").attr("id", node.id)
					);
					(function(){
					let $parents = $("<parents>");
					let p = "";
					for (let i=0; i<node.parents.length; i++) {
						p += (i!=0?" ":"") + node.parents[i].id;
					}
					if (p!=="")  $el.append($parents.text(p));
					$el.append(
						$("<definition lower='0' upper='1'>").text(node.def.funcText)
					);
					})();
				}
			}
			else if (node.type == "decision") {
				var $el = null;
				$smile.find("> nodes").append(
					$el = $("<decision>").attr("id", node.id)
				);
				(function(){
				for (var i=0; i<node.states.length; i++) {
					var $state = $("<state>").attr("id", node.states[i].id);
					$el.append($state);
				}
				var $parents = $("<parents>");
				var p = "";
				for (var i=0; i<node.parents.length; i++) {
					p += (i!=0?" ":"") + node.parents[i].id;
				}
				if (p!=="")  $el.append($parents.text(p));
				})();
			}
			else if (node.type == "utility") {
				var $el = null;
				$smile.find("> nodes").append(
					$el = $("<utility>").attr("id", node.id)
				);
				(function(){
				var $parents = $("<parents>");
				var p = "";
				for (var i=0; i<node.parents.length; i++) {
					p += (i!=0?" ":"") + node.parents[i].id;
				}
				if (p!=="")  $el.append($parents.text(p));
				$el.append(
					$("<utilities>").text(Array.prototype.slice.call(node.def.funcTable).map(function(s){return node.states[s].id;}).join(" "))
				);
				})();
			}
		}
		$smile.append(
			'<extensions><genie version="1.0" app="GeNIe 2.0.5219.0" name="Sub0" faultnameformat="nodestate"></genie></extensions>'
		);
		function formatPos(pos, size) { return Math.round(pos.x)+" "+Math.round(pos.y)
						+" "+Math.round(pos.x+size.width)+" "+Math.round(pos.y+size.height); }
		function formatColor(col) {
			if (!col)  return col;
			col = col.replace(/#/, '');
			col = col.length == 3 ? col.split().map(v => v+v).join('') : col;
			return col;
		}
		/// If there are submodels, save them
		function makeSubmodel(submodel) {
			var $s = $('<submodel>').attr('id', submodel.id);
			$s
				.append($('<name>').text(submodel.label ? submodel.label : submodel.id))
				.append($("<position>").text(formatPos(submodel.pos, submodel.size)))
				/// GeNIe is awfully fussy (it requires format info, otherwise it breaks)
				.append($('<interior>').attr('color', formatColor(submodel.format.backgroundColor) || "e5f6f7"))
				.append($('<outline>').attr('color', formatColor(submodel.format.borderColor) || '0000bb'))
				.append($('<font>').attr('color', formatColor(submodel.format.fontColor) || '000000').attr('name', submodel.format.fontFamily || 'Arial').attr('size', submodel.format.fontSize || 8));
			for (var mySubmodel of Object.values(submodel.submodelsById)) {
				$s.append(makeSubmodel(mySubmodel));
			}
			if (submodel.subItems.length) {
				for (let item of submodel.subItems) {
					makeTextBox(item).appendTo($s);
				}
			}
			return $s;
		}
		function makeTextBox(item) {
			var $caption = $('<caption>').text(item.text);
			$caption.textContent = item.text;
			return $('<textbox>').append(
				$caption,
				$('<font>').attr({
					color: formatColor(item.format.fontColor) || '000000',
					name: item.format.fontFamily || 'Arial',
					size: item.format.fontSize || 8,
				}),
				$('<position>').text(formatPos(item.pos, item.size)),
			);
		}
		$smile.find('> extensions > genie').append(
			Object.values(this.submodelsById).filter(s=>s.submodelPath.length==0).map(s=>makeSubmodel(s))
		);
		for (var i=0; i<sortedNodes.length; i++) {
			var node = sortedNodes[i];
			var $node = $("<node>").attr("id", node.id);
			console.log(node.pos, node.size, formatPos(node.pos, node.size));
			$node
				.append($("<name>").text(node.label ? node.label : node.id))
				.append($("<position>").text(formatPos(node.pos, node.size)))
				/// GeNIe is awfully fussy (it requires format info, otherwise it breaks)
				.append($('<interior>').attr('color', formatColor(node.format.backgroundColor) || "e5f6f7"))
				.append($('<outline>').attr('color', formatColor(node.format.borderColor) || '0000bb'))
				.append($('<font>').attr('color', formatColor(node.format.fontColor) || '000000').attr('name', node.format.fontFamily || 'Arial').attr('size', node.format.fontSize || 8));
			if (node.comment) {
				$node.append($('<comment>').text(node.comment));
			}
			if (node.submodelPath) {
				$submodel = $smile.find("> extensions > genie");
				for (var id of node.submodelPath) {
					$submodel = $submodel.find(`> submodel#${id}`);
				}
				$submodel.append($node);
			}
			else {
				$smile.find("> extensions > genie").append($node);
			}
		}
		if (this.evidenceSets.length) {
			$makeBelieve = $('<make-believe>');
			$makeBelieve.append($('<evidence-sets>').append(
				this.evidenceSets.map(e => $('<evidence>').text(JSON.stringify(e)))
			));
			$smile.find('> extensions').append($makeBelieve);
		}
		if (this.subItems.length) {
			for (let item of this.subItems) {
				makeTextBox(item).appendTo($smile.find('> extensions > genie'));
			}
		}
		if (this.comment) {
			$('<comment>').text(this.comment).appendTo($smile.find('> extensions > genie'));
		}
		return vkbeautify.xml('<?xml version="1.0"?>' + $smile[0].outerHTML).replace(/\r?\n/g, '\r\n');
	},
	/** Creates a new, filtered, BN based on the node subset
	    Will only preserve direct arcs.
	**/
	makeFilteredStructure(nodeSubset) {
		let bn = new BN();
		nodeSubset = nodeSubset.map(n => n?.id ?? n);
		for (let nodeId of nodeSubset) {
			bn.addNode(nodeId);
		}
		for (let nodeId of nodeSubset) {
			for (let par of this.node[nodeId].parents) {
				if (nodeSubset.find(nId => nId == par.id)) {
					bn.node[nodeId].addParents([par.id]);
				}
			}
		}
		return bn;
	},
	/// Slightly shorter names, slightly more consistent with bni
	/*find(id) {
		if (!id)  return null;
		if (id == "..") {
			if (this.currentSubmodel.length==0)  return null;
			return this.getSubmodel(this.currentSubmodel.slice(0,-1));
		}
		// return this.nodesById[id] || this.submodelsById[id]
			// || this.basicItems.find(i => i.id == id);
		this.getAllItems().find(i => i.id
	},*/
	find: Submodel.prototype.find,
	findItems: Submodel.prototype.findItems,
	getItems() {
		let mySubmodels = Object.values(this.submodelsById).filter(s => s.submodelPath.length==0);
		return [...this.subNodes,...this.subItems,...mySubmodels];
	},
	getAllItems() {
		return [...this.nodes,...this.basicItems,...Object.values(this.submodelsById)];
	},
	getAllNodes: Submodel.prototype.getAllNodes,
	/**
	Add a new node to the network. net.addNode(...) is equivalent to |new Node(net, ...)|.
	*/
	addNode: function(id, states, opts) {
		opts = opts || {};
		console.log(opts);

		var newNode = new Node(Object.assign({
			id: id,
			states: states,
		}, opts, {net: this, pathsIn:[], pathsOut:[]}));

		return newNode;
	},
	/**
	Add a submodel to the network. net.addSubmodel(...) is equivalent to |new Submodel(net, ...)|.
	*/
	addSubmodel: function(id, opts) {
		opts = opts || {};

		var newSubmodel = new Submodel(Object.assign({
			id: id
		}, opts, {net: this, pathsIn:[], pathsOut:[]}));

		return newSubmodel;
	},
	addTextBox: function(text, opts) {
		if (text.id) { this._addTextBoxObject(text); return; }

		opts = opts || {};

		var textBox = new TextBox(Object.assign({
			text: text,
		}, opts, {net: this}));

		return textBox;
	},
	addImageBox: function(imageUrl, opts) {
		if (imageUrl.id) { this._addImageBoxObject(imageUrl); return; }

		opts = opts || {};

		var imageBox = new ImageBox(Object.assign({
			imageUrl,
		}, opts, {net: this}));

		return imageBox;
	},
	_addTextBoxObject(textBox) {
		textBox.net = this;
		this.basicItems.push(textBox);
	},
	_addImageBoxObject(imageBox) {
		imageBox.net = this;
		this.basicItems.push(imageBox);
	},
	/** Cut/copy/paste (non-GUI functions) **/
	copy(items = null) {
		if (!items)  items = [...this.selected];
		return items.map(item => item.duplicate());
	},
	paste(items, loc = null) {
		let bn = this;
		let offset = {x: 10, y: 10};
		let addedItems = [];
		let idMap = {};
		for (let item of this.items) {
			let dupItem = item.duplicate();
			let dupI = 1;
			let newId = null;
			do {
				newId = dupItem.id + `_${dupI}`;
				dupI++;
			} while(bn.find(newId));
			dupItem.id = newId;
			idMap[item.id] = dupItem.id;
			if (offset) {
				dupItem.pos.x += offset.x;
				dupItem.pos.y += offset.y;
			}
			if (dupItem.parents) {
				/// Drop children and parents for now (won't affect node definition)
				dupItem.children = [];
				dupItem.parents = [];
			}
			if (dupItem.addToNet) {
				addedItems.push( dupItem.addToNet(bn) );
			}
		}
		/// Wire up the added items correctly
		for (let [i,item] of addedItems.entries()) {
			if (item.isGraphItem()) {
				item.addParents(this.items[i].parents.map(p => idMap[p.id] || p.id));
				item.addChildren(this.items[i].children.map(c => idMap[c.id] || null).filter(c => c!==null));
			}
		}
	},
	nodesByKey: function(key) {
		if (!key)  return this.nodes.reduce((o,n) => { o[n._key] = n; return o }, {});
		return this.nodes.find(n => n._key == key);
	},
	getItem: function(el) {
		$el = $(el);
		var id = $el[0].id.replace(/^display_/, '');
		return this.getItemById(id);
	},
	/// I now have this slight problem that Item -> {Node, Submodel},
	/// when previously I just had Node
	getItemById: function(id) {
		if (id in this.nodesById)  return this.nodesById[id];
		var displayItem = this.basicItems.find(i => i.id == id);
		if (displayItem)  return displayItem;

		var toVisit = [this];
		while (toVisit.length) {
			var submodel = toVisit.shift();

			if (id in submodel.submodelsById)  return submodel.submodelsById[id];

			for (var submodelId in submodel.submodelsById)  toVisit.push(submodel.submodelsById[submodelId]);
		}

		return null;
	},
	getSubmodel: function(submodelPath) {
		/// XXX: I've obviously got something wrong, if I need to use instanceof/type/etc.,
		/// rather than structural checking
		if (submodelPath instanceof Submodel)  return submodelPath;
		submodelPath = BN.makeSubmodelPath(submodelPath);

		var s = this;
		for (var i=0; i<submodelPath.length; i++) {
			s = s.submodelsById[submodelPath[i]];
		}
		return s;
	},
	getCurrentSubmodel() {
		return this.getSubmodel(this.currentSubmodel);
	},
	setEvidence: function(evidence, o) {
		o = o || {};
		o.reset = o.reset || false;

		if (o.reset)  this.evidence = {};
		for (let [k,v] of Object.entries(evidence)) {
			if (v==null)  delete this.evidence[k];
			else          this.evidence[k] = v;
		}

		return this;
	},
	addNodes(data) {
		let bn = this;
		let attrs = Object.keys(data[0]);

		let stateCounts = {};
		for (let attr in data[0])  stateCounts[attr] = {};
		for (let row of data) {
			for (let attr in row) {
				attrState = row[attr];
				if (typeof(stateCounts[attr][attrState])=="undefined")  stateCounts[attr][attrState] = 0;
				stateCounts[attr][attrState]++;
			}
		}

		/// Make all the nodes
		for (let attr of attrs) {
			let child = bn.addNode(attr, Object.keys(stateCounts[attr]));
		}
	},
	/// Lot's of limitations: discrete, no auto-discretize, etc.
	/// XXX: I've just written this without testing it yet!
	learnParametersCounting: function(data) {
		/// Array.isArray tests *just* for |Array| specifically (not float arrays, etc.)
		function isNumericArray(value) {
			return value.length && !isNaN(value[0]);
		}

		var nodes = Object.keys(data[0]).map(id => this.nodesById[id]).filter(n => n);

		/// Start fresh (everything has a count of 1)
		for (var node of nodes) {
			node.def.cptCounts = new Float32Array(new ArrayBuffer(4*node.def.cpt.length));
			for (var i=0; i<node.def.cptCounts.length; i++)  node.def.cptCounts[i] = 0;
		}
		/// Run through data, counting parent combos + child values
		//var i = 0;
		for (var row of data) {
			var rowWeights = row.$$weight === undefined ? 1 : JSON.parse(row.$$weight);
			if (!isNumericArray(rowWeights))  rowWeights = [rowWeights];
			var rowWeightI = 0;
			var missingNodes = [];
			var missingNodeStates = [];
			if (rowWeights.length > 1) {
				/// Make a copy of row, because we'll overwrite things in it
				row = Object.assign({}, row);
				missingNodes = Object.keys(row).filter(id => row[id]==='*').map(id => this.nodesById[id]).filter(n => n);
				missingNodeStates = new Array(missingNodes.length).fill(0);
			}
			do {
				var rowWeight = rowWeights[rowWeightI];
				for (var [i,node] of missingNodes.entries()) {
					row[node.id] = node.states[missingNodeStates[i]].id;
				}
				/// Clean up entries (convert to arrays, if needed)
				for (var node of nodes) {
					var value = row[node.id];
					/// Instead of a specific state, we may get a distribution
					/// Apportion the count of '1' (or whatever degree we have)
					/// according to that distribution.
					/// Note: Can't have '[' as part of state name, so we probably have JSON array
					/// (or maybe some other syntax?)
					if (!isNumericArray(value) && value[0] == "[") {
						value = JSON.parse(value);
						row[node.id] = value;
					}
					/// Not checking if the array is truly a prob vector. Shouldn't be too much of
					/// an issue.
				}
				//console.log(i); i++;
				for (var node of nodes) {
					/// We need to make as many parent state arrays as the cartesian product
					/// of parents with distributions (and ignore parents set to single states)
					var multiples = 1;
					/// We'll do them as separate vars, because we need distroParentStates later
					var distroParents = [];
					var distroParentIs = [];
					var distroParentStates = [];
					for (var [pi,parent] of node.parents.entries()) {
						if (parent.id in row && isNumericArray(row[parent.id])) {
							multiples *= parent.states.length;
							distroParents.push(parent);
							distroParentIs.push(pi);
							distroParentStates.push(0);
						}
					}
					/// Create array for all parent states
					var allParentStates = [];
					for (var i=0; i<multiples; i++) {
						allParentStates.push(new Array(node.parents.length));
					}
					/// Create weights for all parent states
					var allParentStateWeights = new Array(allParentStates.length).fill(rowWeight);

					/// Go through parents, mark skip if encounter missing.
					/// Otherwise, fill in parent states for single-state case parents
					var missing = !(node.id in row) || row[node.id]==='*';
					if (!missing) {
						for (var [pi,parent] of node.parents.entries()) {
							if (parent.id in row && row[parent.id]!=='*') {
								/// For simple states, just fill up each parentState with the fixed
								/// state
								if (!isNumericArray(row[parent.id])) {
									for (var i=0; i<multiples; i++) {
										allParentStates[i][pi] = row[parent.id];
									}
								}
							}
							else {
								missing = true; break;
							}
						}
					}
					/// Skip if missing
					if (!missing) {
						/// For parents that have distributions, assign states for every combination
						/// And determine the weight for that combination
						var i = 0;
						do {
							for (var [pi,parent] of distroParents.entries()) {
								allParentStates[i][ distroParentIs[pi] ] = distroParentStates[pi];
								allParentStateWeights[i] *= row[parent.id][ distroParentStates[pi] ];
							}
							i++;
						} while (nextCombination(distroParents, distroParentStates));
						/// Go through all parent states, and count!
						for (var [psi,parentStates] of allParentStates.entries()) {
							var weight = allParentStateWeights[psi];
							var value = row[node.id];
							var rowI = node.def.getLookupRowI(parentStates);
							/// Have we got a numeric sequence?
							if (isNumericArray(value)) {
								//onsole.log(parentStates, rowI, value);
								for (var i=0; i<value.length; i++) {
									node.def.cptCounts[rowI*node.states.length + i] += value[i]*weight;
								}
							}
							else {
								//onsole.log(parentStates, rowI, node.statesById[row[node.id]].index, value);
								node.def.cptCounts[rowI*node.states.length + node.statesById[value].index] += weight;
							}
						}
					}
				}
				rowWeightI++;
			} while (nextCombination(missingNodes, missingNodeStates));
		}
		/// Run through counts, normalize, and update CPTs
		for (var node of nodes) {
			/// Step through each row
			for (var i=0; i<node.def.cptCounts.length; i += node.states.length) {
				var normalized = normalize(Array.prototype.slice.call(node.def.cptCounts, i, i+node.states.length));
				for (var [vi,v] of normalized.entries()) {
					node.def.cpt[i+vi] = v;
				}
			}
		}
		this.needsCompile = true;
	},
	learnParametersEm: async function(data) {
		var currentEvidence = this.evidence;

		var iterations = 100;

		var nodes = Object.keys(data[0]).map(id => this.nodesById[id]).filter(n => n);

		/// Make a copy of the data, that we will fill
		var filledData = new Array(data.length);
		window.filledData = filledData;
		for (var rowI=0; rowI<data.length; rowI++)  filledData[rowI] = Object.assign({},data[rowI]);

		var maxIter = 30;
		var iter = 0;
		while (1) {
			/// Learn parameters based on current filledData (Maximization)
			this.learnParametersCounting(filledData);

			/// Fill in parameters based on current model (Expectation)
			/// (In this case, we use distributions rather than most probable state.)

			/// Convergence test (NYI!)
			if (--maxIter <= 0)  break;

			/// Go through data and fill in missing with our
			/// newly learned parameters
			for (var [rowI,row] of data.entries()) {
				var ev = {};
				var missingNodes = [];
				for (var node of nodes) {
					if (row[node.id] !== '*') {
						ev[node.id] = row[node.id];
					}
					else {
						missingNodes.push(node);
					}
				}
				if (missingNodes.length) {
					this.evidence = ev;
					//onsole.log( ev );
					await new Promise((resolve,reject) => {
						this.updateBeliefs(resolve, iterations);
					});
					/*this.updateBeliefs_local(null, iterations);*/
					for (var node of missingNodes) {
						filledData[rowI][node.id] = node.beliefs.slice();
						console.log( node.id, filledData[rowI][node.id] );
					}
					if (0) {
					for (var node of this._nodeOrdering) {
						var thisEv = {};
						if (missingNodes.includes(node)) {
							this.evidence = thisEv;
							await new Promise((resolve,reject) => {
								this.updateBeliefs(resolve, iterations);
							});
							/*var r = Math.random();
							var s = 0;
							var i = 0;
							var bel = normalize(node.beliefs);
							for (; i<bel.length; i++) {
								s += bel[i];
								if (r < s) break;
							}*/
							//if (i >= node.beliefs.length)  i--;
							//filledData[rowI][node.id] = node.states[i].id;
							filledData[rowI][node.id] = node.beliefs.slice();
							//thisEv[node.id] = node.states[i].id;
						}
						else {
							thisEv[node.id] = ev[node.id];
						}
						/*var r = Math.random();
						var s = 0;
						var i = 0;
						var bel = normalize(node.beliefs);
						for (; i<bel.length; i++) {
							s += bel[i];
							if (r < s) break;
						}
						//if (i >= node.beliefs.length)  i--;
						filledData[rowI][node.id] = node.states[i].id;
						ev[node.id] = node.states[i].id;*/
						/*var maxI = -1, maxBelief = -1;
						for (var i=0; i<node.beliefs.length; i++) {
							if (node.beliefs[i] > maxBelief) {
								maxI = i;
								maxBelief = node.beliefs[i];
							}
						}
						filledData[rowI][node.id] = node.states[maxI].id;
						ev[node.id] = node.states[maxI].id;*/
						//filledData[rowI][node.id] = node.beliefs.slice();
					}
					}
				}
			}
			iter++;
			//break;
		}

		console.log(filledData);

		this.evidence = currentEvidence;
	},
	learnStructureNaiveBayes: function(data, classNode) {
		var bn = this;
		var attrs = Object.keys(data[0]);
		classNode = classNode || attrs[attrs.length-1];

		var stateCounts = {};
		for (var attr in data[0])  stateCounts[attr] = {};
		for (var row of data) {
			for (var attr in row) {
				attrState = row[attr];
				if (typeof(stateCounts[attr][attrState])=="undefined")  stateCounts[attr][attrState] = 0;
				stateCounts[attr][attrState]++;
			}
		}

		/// Make target node
		var target = bn.addNode(classNode, Object.keys(stateCounts[classNode]));

		/// Make all the nodes
		for (var attr of attrs) {
			if (attr != classNode) {
				var child = bn.addNode(attr, Object.keys(stateCounts[attr]));
				child.addParents([target]);
			}
		}

		/// Learn the parameters
		this.learnParametersCounting(data);

		return this;
	},
	sampleData: [
		{a: 1, b: 1, c: 0},
		{a: 1, b: 0, c: 1},
		{a: 1, b: 1, c: 1},
		{a: 1, b: 0, c: 1},
		{a: 1, b: 0, c: 1},
		{a: 1, b: 0, c: 1},
		{a: 0, b: 1, c: 1},
		{a: 1, b: 1, c: 0},
	],
	/**
		Matrix must be square and upper triangular. Empty
		entries are indicated using a -1.
	*/
	maxWeightSpanningTree: function(matrix) {
		var side = Math.sqrt(matrix.length);
		if (side - Math.floor(side))  return;

		var forest = [...new Array(side).keys()].map(a => [[a]]);

		var maxI;
		while ( (maxI = matrix.reduce((a,b,i,arr) => b > arr[a] ? i : a, 0)) && matrix[maxI]!=-1
				&& forest.length > 1) {
			matrix[maxI] = -1;
			var i = Math.floor(maxI / side);
			var j = maxI % side;
			var treesFound = forest.filter(tree => tree.find(pair => pair.find(n => n==i || n==j)!==undefined));
			if (treesFound.length>1) {
				//onsole.log(JSON.stringify(treesFound));
				var mergedTree = [[i,j]];
				for (var tree of treesFound) {
					if (tree[0].length>1) {
						mergedTree = mergedTree.concat(tree);
					}
				}
				//onsole.log(JSON.stringify(mergedTree));
				//onsole.log(JSON.stringify(forest));
				forest = forest.filter(tree => !tree.find(pair => pair.find(n => n==i || n==j)!==undefined));
				//onsole.log(JSON.stringify(forest));
				forest.push(mergedTree);
				//onsole.log(JSON.stringify(forest));
			}
		}

		return forest[0];
	},
	learnStructureTan: function(data, classNode) {
		var bn = this;
		var stats = this.calculateMiStats(data, classNode);
		/// Construct matrix with conditional MI as weights
		/// Only do attributes, not class node
		var attrs = Object.keys(data[0]);
		/// Remove class node
		attrs.splice(attrs.indexOf(classNode),1);

		/// Make adjacency matrix, using conditional MI as entries
		var matrix = [];
		for (var i=0; i<attrs.length; i++) {
			/// Pad entries to ignore with -1
			for (var j=0; j<=i; j++)  matrix[i*attrs.length + j] = -1;
			for (var j=i+1; j<attrs.length; j++) {
				matrix[i*attrs.length + j] = stats.cmis[attrs[i]][attrs[j]];
			}
		}

		/// Make maximum weighted spanning tree
		var tree = this.maxWeightSpanningTree(matrix);

		console.log(JSON.stringify(tree));

		/// Start with random edge
		var edge = tree.shift();
		console.log(JSON.stringify(tree));
		var node1 = attrs[edge[0]];
		var node2 = attrs[edge[1]];
		var root = bn.addNode(node1, Object.keys(stats.marginals[node1]));
		bn.addNode(node2, Object.keys(stats.marginals[node2]), {parents: [root]});
		while ( (edge = tree.shift()) ) {
			node1 = attrs[edge[0]];
			node2 = attrs[edge[1]];
			/// If neither node is in graph, not ready for this edge yet
			if (!bn.nodesById[node1] && !bn.nodesById[node2]) {
				tree.push(edge);
				continue;
			}
			console.log(JSON.stringify(tree));
			/// One of the nodes will be in the graph (not both, otherwise
			/// it's not a single tree)
			if (bn.nodesById[node1]) {
				var states = Object.keys(stats.marginals[node2]);
				/// Edge will be directed directed out (i.e. to the new node)
				bn.addNode(node2, states, {parents: [node1]});
			}
			else {
				var states = Object.keys(stats.marginals[node1]);
				/// Edge will be directed directed out (i.e. to the new node)
				bn.addNode(node1, states, {parents: [node2]});
			}
		}

		/// Add the class node
		bn.addNode(classNode, Object.keys(stats.marginals[classNode]), {children: attrs});

		/// Learn the parameters
		this.learnParametersCounting(data);

		return this;
	},
	calculateMiStats: function(data, classVar) {
		/// Initialisation
		var marginalCounts = {};
		var pairs = {};
		var pairsByClass = {}
		var keys = Object.keys(data[0]);
		for (var i=0; i<keys.length; i++) {
			var v1 = keys[i];
			marginalCounts[v1] = {};
			pairs[v1] = {};
			for (var j=i+1; j<keys.length; j++) {
				var v2 = keys[j];
				pairs[v1][v2] = {byClass: {}, pair: {}};
			}
		}

		/// Do the counts
		var cState;
		for (var row of data) {
			if (classVar)  cState = row[classVar];
			for (var i=0; i<keys.length; i++) {
				var v1 = keys[i];
				var s1 = row[v1];
				var m = marginalCounts[v1];
				if (!m[s1])  m[s1] = 0;
				m[s1]++;
				for (var j=i+1; j<keys.length; j++) {
					var v2 = keys[j];
					var s2 = row[v2];
					var p = pairs[v1][v2].pair;
					var c = pairs[v1][v2].byClass;

					if (!p[s1])  p[s1] = {};
					if (!p[s1][s2])  p[s1][s2] = 0;
					p[s1][s2]++;

					if (classVar) {
						if (!c[s1])  c[s1] = {};
						if (!c[s1][s2])  c[s1][s2] = {};
						if (!c[s1][s2][cState])  c[s1][s2][cState] = 0;
						c[s1][s2][cState]++;
					}
				}
			}
		}

		//onsole.log(marginalCounts);
		//onsole.log(pairs);

		var marginals = {};
		var entropies = {};
		var mis = {};
		var cmis = {};

		/// Calculate marginal and entropy stats
		var N = data.length;
		for (var [attr,stateCounts] of Object.entries(marginalCounts)) {
			marginals[attr] = {};
			entropies[attr] = 0;
			for (var [state,count] of Object.entries(stateCounts)) {
				var m = count/N;
				marginals[attr][state] = m;
				entropies[attr] += m * -Math.log2(m);
			}
		}

		//onsole.log(marginals);
		//onsole.log(entropies);

		var classStates;
		if (classVar) {
			classStates = Object.keys(marginalCounts[classVar]);
		}

		/// Calculate MI and Conditional MI stats (slightly more involved)
		for (var i=0; i<keys.length; i++) {
			var v1 = keys[i];
			var v1States = Object.keys(marginalCounts[v1]);
			var m1 = marginals[v1];
			mis[v1] = {};
			cmis[v1] = {};
			for (var j=i+1; j<keys.length; j++) {
				var v2 = keys[j];
				var v2States = Object.keys(marginalCounts[v2]);
				var m2 = marginals[v2];
				var mi = 0;
				var cmi = 0;
				var p = pairs[v1][v2].pair;
				var c = pairs[v1][v2].byClass;
				for (var k=0; k<v1States.length; k++) {
					var v1State = v1States[k];
					for (var l=0; l<v2States.length; l++) {
						var v2State = v2States[l];
						var [x,y] = [v1State,v2State];
						/// Mutual Information
						if (p[x][y]!==undefined) {
							var comb = p[x][y]/N;
							//onsole.log(v1,v2,x,y,comb,m1[x],m2[y]);
							mi += comb * Math.log2(comb/(m1[x]*m2[y]));
							//onsole.log(mi);
						}
						/// Conditional Mutual Information
						if (classVar) {
							if (v1!=classVar && v2!=classVar) {
								for (var h=0; h<classStates.length; h++) {
									var v3State = classStates[h];
									var m3 = marginals[classVar];
									var z = v3State;
									var zCount = marginalCounts[classVar][z];
									if (c[x][y]!==undefined && c[x][y][z]!==undefined) {
										var comb = c[x][y][z]/N;
										if (pairs[v1][classVar]) {
											var pxz = pairs[v1][classVar].pair[x][z]/N;
										}
										else {
											var pxz = pairs[classVar][v1].pair[z][x]/N;
										}
										if (pairs[v2][classVar]) {
											var pyz = pairs[v2][classVar].pair[y][z]/N;
										}
										else {
											var pyz = pairs[classVar][v2].pair[z][y]/N;
										}
										cmi += comb * Math.log2(
											(m3[z] * comb)/
											(pxz * pyz)
										);
									}
								}
							}
						}
					}
				}
				mis[v1][v2] = mi;
				cmis[v1][v2] = cmi;
			}
		}

		//onsole.log(mis);
		//onsole.log(cmis);
		return {marginals, entropies, mis, cmis};
	},
	/** Set the method used for belief updating. At the moment,
		this is either local (sequential) or worker-based (parallel),
		but it could be extended to other belief updating algorithms.

		FIX: Make local and worker function calls use the same interface. i.e., local
		should take a callback to notify about completion (even though that
		happens sequentially). **/
	setUpdateMethod(method) {
		this.updateMethod = method;
		this.compile({force:true});
		//this.updateBeliefs = this["updateBeliefs_"+method];
		return this;
	},
	/// This updates the expected value for the current network,
	/// given the current evidence.
	updateExpectedValue: function() {
				console.log('xxx');
		/// XXXXXX Calculating net's current expected value
		if (this._utilityNodes.length) {
			var totalUtility = 0;
			for (var i=0; i<this._utilityNodes.length; i++) {
				console.log('ttt', this._utilityNodes.length, new Date());
				var uNode = this._utilityNodes[i];
				var ev = 0;
				for (var j in uNode.values) {
				console.log('zzz');
					ev += uNode.values[j]*uNode.beliefs[j];
				}
				totalUtility += ev;
			}
			this.expectedValue = totalUtility;
		}
	},
	/// FIX: I'm pretty sure this needs to be removed
	updateBeliefs(callback, iterations) {
		/// Hack for command line
		if (!this.updateMethodActual) {
			this.compile();
		}
		let updateMethod = this.updateMethodActual;
		this.updateMethodActualTitle = BN.updateMethodTitles[updateMethod];
		console.log('Using method: '+updateMethod+(this.useWorkers?' (workers)':' (local)'));
		//this.expectedValue = null;
		let methodToCall = 'updateBeliefs_'+updateMethod+(this.useWorkers?'Worker':'');
		console.log(methodToCall);
		this[methodToCall](callback, iterations);
		//this.updateBeliefs_local(callback, iterations);
		//this.updateExpectedValue();
	},
	updateBeliefs_off(callback, iterations) {
		for (let i=0; i<this.nodes.length; i++) {
			let node = this.nodes[i];
			node.beliefs = newArray(node.beliefs.length, 1/node.beliefs.length);
		}
		callback?.(this, null);
	},
	updateBeliefs_local(callback, iterations) {
		this['updateBeliefs_'+this.updateMethod](callback, iterations);
	},
	updateBeliefs_worker(callback, iterations) {
		this['updateBeliefs_'+this.updateMethod+'Worker'](callback, iterations);
	},
	updateBeliefs_junctionTree(callback, iterations) {
		/*let jtree = new JunctionTree(makeBnForUpdates(this));
		console.time('compile');
		jtree.compile();
		console.timeEnd('compile');*/
		console.time('propagate');
		let beliefs = this.jtree.propagate(this.evidence);
		for (let [nodeId,bels] of Object.entries(beliefs)) {
			this.nodesById[nodeId].beliefs = bels;
		}
		console.timeEnd('propagate');
		
		if (callback)  callback(this, null);
	},
	updateBeliefs_junctionTreeWorker(callback, iterations) {
		let bn = this;
		this.compile();
		
		/// Convert evidence to array
		var evidenceArr = new Int32Array(new ArrayBuffer(bn.nodes.length*4));
		for (var i=0; i<evidenceArr.length; i++)  evidenceArr[i] = -1;
		for (var i in this.evidence) {
			if (typeof(this.evidence[i])=="string") {
				evidenceArr[bn.nodesById[i].intId] = bn.nodesById[i].statesById[this.evidence[i]].index;
			}
			else {
				evidenceArr[bn.nodesById[i].intId] = Number(this.evidence[i]);
			}
		}
		
		/// Just the 1 worker
		let w = this._workers[0];

		w.postMessage([1, evidenceArr]);
		w.onmessage = function(e) {
			if (e.data[0]==0) {
				var workerBeliefs = e.data[1];
				for (var i=0; i<workerBeliefs.length; i++) {
					bn.nodes[i].beliefs = workerBeliefs[i];
				}
				bn.updateExpectedValue();
				if (callback)  callback(bn, 1);
			}
			else if (e.data[0] == 1) {
				console.log(e.data);
			}
		};
	},
	/// Run a belief update, using worker threads to
	/// perform the computations in parallel
	updateBeliefs_likelihoodWeightingWorker: function(callback, iterations) {
		console.log('worker');
		if (!iterations) { iterations = this.iterations; }
		var bn = this;

		this.compile();

		var numWorkers = this.numWorkers;

		/// If we have too many workers given a small (tiny) # of iterations desired,
		/// reduce the number of workers
		if (iterations < numWorkers)  numWorkers = iterations;

		/// Convert evidence to array
		var evidenceArr = new Int32Array(new ArrayBuffer(bn.nodes.length*4));
		for (var i=0; i<evidenceArr.length; i++)  evidenceArr[i] = -1;
		for (var i in this.evidence) {
			if (typeof(this.evidence[i])=="string") {
				evidenceArr[bn.nodesById[i].intId] = bn.nodesById[i].statesById[this.evidence[i]].index;
			}
			else {
				evidenceArr[bn.nodesById[i].intId] = Number(this.evidence[i]);
			}
		}

		/**
		This used to be used for debugging, to make sure bnToPass worked the same
		with local updating. Not sure if needed now since local updating uses the
		exact same function as the worker now.
		if (false) {
			updateBeliefs_local(bnToPass, evidenceArr);
			if (callback)  callback(bn);
		}*/
		var numComplete = 0;
		var totalIterationsRun = 0;
		for (var wi=0; wi<numWorkers; wi++) {
			var w = this._workers[wi];
			var numWorkerIterations = Math.ceil(iterations/numWorkers);
			if (this.timeLimit) {
				numWorkerIterations = 1000000000000;
			}
			w.postMessage([2, this.timeLimit]);
			w.postMessage([1, evidenceArr, numWorkerIterations]);
			w.onmessage = function(e) {
				if (e.data[0]==0) {
					numComplete++;
					let nodeResults = e.data[1];
					let iterationsRun = e.data[2];
					totalIterationsRun += iterationsRun;
					for (let i=0; i<nodeResults.length; i++) {
				console.log('ggg');
						let workerBeliefs = nodeResults[i].beliefs;
						let workerSamples = nodeResults[i].samples;
						let workerSampleWeights = nodeResults[i].sampleWeights;
						//console.log(workerBeliefs, workerSamples);
						//onsole.log(bn.nodes[i].beliefs, bn.nodes[i].samples);
						if (numComplete==1) {
							bn.nodes[i].beliefs = workerBeliefs;
							bn.nodes[i].samples = workerSamples;
							bn.nodes[i].sampleWeights = workerSampleWeights;
						}
						else {
							var allBeliefs = bn.nodes[i].beliefs;
							//var allSamples = Array.prototype.slice.call(bn.nodes[i].samples);
							for (var bi=0; bi<allBeliefs.length; bi++) {
								allBeliefs[bi] += workerBeliefs[bi];
								if (numComplete == numWorkers) {
									allBeliefs[bi] /= numComplete;
								}
							}
							//onsole.log(workerSamples[i]);
							bn.nodes[i].beliefs = allBeliefs;
							bn.nodes[i].samples = new Float32Array([].concat.call(
								[].slice.call(bn.nodes[i].samples),
								[].slice.call(workerSamples)
							));
							bn.nodes[i].sampleWeights = new Float32Array(
								bn.nodes[i].sampleWeights.concat(workerSampleWeights)
							);
							if (bn.nodes[i].def.type == 'Equation' && numComplete == numWorkers) {
								bn.nodes[i].updateDiscretization();
							}
						}
					}
					if (numComplete == numWorkers) {
				console.log('fff');
						bn.updateExpectedValue();
						if (callback)  callback(bn, totalIterationsRun);
						// Send to UI
						console.log("Total iterations run:", totalIterationsRun);
					}
				}
				else if (e.data[0] == 1) {
					console.log(e.data);
				}
			};
		}
	},
	/// Do a belief update *without* any parallel computation. This
	/// should typically only be used for debugging, or in some
	/// specialised cases from the API. (It uses the same functions as the
	/// worker, but keeps the compuation on the main thread.)
	updateBeliefs_likelihoodWeighting(callback, iterations) {
		if (!iterations) { iterations = this.iterations; }
		var bn = this;

		this.compile(true);

		/// Convert evidence to array
		var evidenceArr = new Int32Array(new ArrayBuffer(bn.nodes.length*4));
		for (var i=0; i<evidenceArr.length; i++)  evidenceArr[i] = -1;
		for (var i in this.evidence) {
			if (typeof(this.evidence[i])=="string") {
				evidenceArr[bn.nodesById[i].intId] = bn.nodesById[i].statesById[this.evidence[i]].index;
			}
			else {
				evidenceArr[bn.nodesById[i].intId] = Number(this.evidence[i]);
			}
		}

		updateBeliefs_local(bn, evidenceArr, iterations);

		for (var i=0; i<bn.nodes.length; i++) {
			var node = bn.nodes[i];
			if (node.def.func) {
				node.updateDiscretization();
			}
			else {
				for (var j=0; j<node.beliefs.length; j++) {
					if (node.seen>0)  node.beliefs[j] = node.counts[j]/node.seen;
				}
			}
		}
		
		this.updateExpectedValue();

		if (callback)  callback(bn, iterations);
	},
	/// This will generate a single case into the 'cas' parameter
	/// XXX: This needs updating with a pointer to the independent version
	generateCase: function(evidence, cas) {
		var bn = this;

		var weight = 1;

		/// Run through nodes in topological order
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
			//return rowI;

			if (_node.def.func) {
				/// Evidence not supported yet!
				if (evidence[_node.intId] != -1) {

				}
				else {
					/// Generate value for node
					var parents = _node.parents;
					for (var pi=0; pi<parents.length; pi++) {
						_node.parentStates[pi] = cas[parents[pi].intId];
					}
					cas[_node.intId] = _node.def.func(_node.parentStates);
				}
			}
			else if (_node.def.cpt) {
				if (evidence[_node.intId] != -1) {
					/// Force evidence
					cas[_node.intId] = evidence[_node.intId];

					/// Calculate likelihood of evidence
					var likelihood = _node.def.cpt[rowI*_node.states.length + cas[_node.intId]];
					weight *= likelihood;
				}
				else {
					/// Generate state for node
					var stateProbs = _node.def.cpt;

					var parents = _node.parents;
					//onsole.debug("parents", parents);

					var currentSum = 0;
					var rowStart = rowI*_node.states.length;
					var rowEnd = (rowI+1)*_node.states.length-1;
					//onsole.debug("rowStart/End", parents, rowI, rowStart, rowEnd, Array.apply([], _node.def.cpt).slice(rowStart,rowEnd+1));
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
			else if (_node.def.funcTable) {
				if (evidence[_node.intId] != -1) {
					/// Force evidence
					cas[_node.intId] = evidence[_node.intId];

					/// Calculate likelihood of evidence (which is either 0 or 1)
					weight *= (_node.def.funcTable[rowI] == cas[_node.intId] ? 1 : 0);
				}
				else {
					/// Get the deterministic state
					cas[_node.intId] = _node.def.funcTable[rowI];
				}
			}
		}

		return weight;
	},
	_getRowI: function(parents, cas) {
		var rowI = 0;
		var multiplier = 1;
		for (var pi=parents.length-1; pi>=0; pi--) {
			rowI += multiplier*cas[parents[pi].intId];
			multiplier *= parents[pi].states.length;
		}
		return rowI;
	},
	/** Search through all possible combinations of decisions for the best
	    choices. This isn't a great thing to run when we have more than a few
	    decisions to make! **/
	async searchDecisionsAll() {
		var decStates = initialStates(this._decisionNodes);
		var origEvidence = Object.assign({}, this.evidence);
		var combList = new Array(numNodeStateCombinations(this._decisionNodes));
		var iterations = 1000;
		var j = 0;
		window.iter = 0;
		do {
			window.iter++;
			for (var i=0; i<decStates.length; i++) {
				this.evidence[this._decisionNodes[i].id] = decStates[i];
			}
			/// Fix: Use the worker version
			await new Promise(resolve => this.updateBeliefs(resolve, iterations));
			this.updateExpectedValue();
			combList[j] = [this.expectedValue,JSON.stringify(decStates)];
			j++;
		} while (nextStates(this._decisionNodes, decStates));
		this.evidence = origEvidence;
		combList.sort(function(a,b) {
			return b[0] - a[0];
		});
		var list = [];
		for (var i=0; i<20 && i<combList.length; i++) {
			var decStates = JSON.parse(combList[i][1]);
			var str = "";
			var sep = "";
			for (var d=0; d<decStates.length; d++) {
				str += sep + this._decisionNodes[d].id+'='+this._decisionNodes[d].states[decStates[d]].id;
				sep = ", ";
			}
			list.push(str+" --> "+combList[i][0]);
		}
		//onsole.log(combList);
		return list;
	},
	/// Sort nodes in directed order
	topologicalSort: function(nodes) {
		/// Create a node ordering that can be used to generate cases quickly (from roots down)
		var q = [];

		/// Create copies of parents, that we can freely modify
		for (var i=0; i<nodes.length; i++) {
			nodes[i]._tempParents = [];
			for (var j=0; j<nodes[i].parents.length; j++) {
				/// Only add parents from 'nodes'
				if (nodes.indexOf(nodes[i].parents[j])!=-1) {
					nodes[i]._tempParents.push(nodes[i].parents[j]);
				}
			}
		}

		/// Start with finding root nodes
		for (var i=0; i<nodes.length; i++) {
			if (nodes[i]._tempParents.length==0) {
				q.push(nodes[i]);
			}
		}

		/// q starts with root nodes only
		for (var i=0; i<q.length; i++) {
			var node = q[i];
			/// Only keep children which are in 'nodes'
			var childNodes = [];
			for (var j=0; j<node.children.length; j++) {
				if (nodes.indexOf(node.children[j])!=-1) {
					childNodes.push(node.children[j]);
				}
			}
			for (var j=0; j<childNodes.length; j++) {
				var allParentsRemoved = true;
				for (var k=0; k<childNodes[j]._tempParents.length; k++) {
					if (childNodes[j]._tempParents[k] == node) {
						childNodes[j]._tempParents[k] = null;
					}
					if (childNodes[j]._tempParents[k] != null) {
						allParentsRemoved = false;
					}
				}
				if (allParentsRemoved) {
					q.push(childNodes[j]);
				}
			}
		}
		return q;
	},
	async searchDecisionsOrdered() {
		var decNodes = this.topologicalSort(this._decisionNodes);
		var decStates = [];
		var origEvidence = Object.assign({}, this.evidence);
		var iterations = 10000;
		for (var i=0; i<decNodes.length; i++) {
			var maxJ = -1;
			var maxEv = -1;
			for (var j=0; j<decNodes[i].states.length; j++) {
				this.evidence[decNodes[i].id] = j;
				await new Promise(resolve => this.updateBeliefs(resolve, iterations));
				this.updateExpectedValue();
				if (this.expectedValue > maxEv) {
					maxEv = this.expectedValue;
					maxJ = j;
				}
			}
			decStates[i] = maxJ;
			this.evidence[decNodes[i].id] = maxJ;
		}
		await new Promise(resolve => this.updateBeliefs(resolve, iterations));
		this.updateExpectedValue();
		ev = this.expectedValue;
		this.evidence = origEvidence;
		return [ev, JSON.stringify(decStates)];
	},
	/** Sensitivity analysis **/
	trackArcInfluences: function() {
		var arcI = 0;
		for (var i=0; i<this.nodes.length; i++) {
			var node = this.nodes[i];
			/// Add a hidden node, that is a child of the node (N) and its actual child (C).
			/// The hidden child should have states that are simply the cartesian
			/// product of the parents, and be deterministic. Then the P(N=x,C=y), is just
			/// the probability of the joint state in the hidden child.
			//node.children
			if (!node.engineOnly && node.id.search(/^__mutualInfo_/)==-1) {
				for (var j=0; j<node.children.length; j++) {
					var child = node.children[j];
					if (child.engineOnly || child.id.search(/^__mutualInfo_/)!=-1)  continue;
					/// Child states = cross-product of parents
					var states = [];
					/// funcTable will just be a diagonal map
					var funcTable = [];
					for (var k=0; k<node.states.length; k++) {
						for (var l=0; l<child.states.length; l++) {
							states.push(node.states[k].id +'_'+child.states[l].id);
							funcTable.push(k*child.states.length + l);
						}
					}
					this.addNode("__mutualInfo_"+arcI, states, {parents: [node, child], engineOnly: true, funcTable: funcTable});
					arcI++;
				}
			}
		}
		this._trackingArcInfluences = true;
	},
	calcProbabilityOfEvidence: function(callback) {
		/// Gather evidence in topological order
		var bn = this;
		var evidenceOrdered = [];
		for (var i=0; i<bn._nodeOrdering.length; i++) {
			var node = bn._nodeOrdering[i];
			if (node.id in bn.evidence) {
				evidenceOrdered.push({node: node.id, state: bn.evidence[node.id]});
			}
		}

		/// Run through evidence nodes in topological order
		/// Before entering evidence, get probability of node for given evidence state
		var savedEvidence = bn.evidence;
		bn.evidence = {};
		var evI = 0;
		var evTotal = 0;
		(function _loop() {
			if (evI < evidenceOrdered.length) {
				bn.updateBeliefs(function() {
					var ev = evidenceOrdered[evI];
					var belief = bn.nodesById[ev.node].beliefs[ev.state];
					bn.evidence[ev.node] = ev.state;

					evTotal += Math.log(belief);

					evI++;
					_loop();
				});
			}
			else {
				callback(Math.exp(evTotal), -evTotal);
			}
		})();
	},
	async calcMi(targetNode) {
		targetNode = typeof(targetNode)=='string' ? this.node[targetNode] : targetNode;
		
		let savedEvidence = {...this.evidence};
		await new Promise(res => this.updateBeliefs(res));
		let origBeliefs = Object.fromEntries(this.nodes.map(n => [n.id,n.beliefs.slice()]));
		let jointBeliefs = targetNode.states.map(s=>({...origBeliefs}));
		if (!(targetNode.id in this.evidence)) {
			let mis = {};
			
			for (let state of targetNode.states) {
				this.evidence[targetNode.id] = state.index;
				await new Promise(res => this.updateBeliefs(res));
				let newBeliefs = this.nodes.map(n => [n.id,n.beliefs.slice()]);
				for (let [id,bel] of newBeliefs) {
					jointBeliefs[state.index][id] = bel.map(b => b*origBeliefs[targetNode.id][state.index]);
				}
			}
			let maxMi = 0;
			for (let nodeId of Object.keys(origBeliefs)) {
				let sum = 0;
				for (let aState=0; aState<this.node[nodeId].states.length; aState++) {
					for (let bState=0;bState<targetNode.states.length; bState++) {
						let ind = 1e-10 + origBeliefs[nodeId][aState]*origBeliefs[targetNode.id][bState];
						let joint = 1e-10 + jointBeliefs[bState][nodeId][aState];
						let partial = joint * Math.log(joint/ind);
						sum += partial;
					}
				}
				mis[nodeId] = {node:nodeId, mi:sum, miPc:0};
				maxMi = Math.max(maxMi, sum);
			}
			Object.entries(mis).forEach(([id,obj]) => obj.miPc = obj.mi/maxMi);
			this.evidence = {...savedEvidence};
			return mis;
		}
		this.evidence = {...savedEvidence};
		await new Promise(res => this.updateBeliefs(res));
		
	},
	/** Performance testing functions
		These all start with the prefix 'perf'. They should probably
		be broken out into their own file.
		FIX: break out into own file.
	**/
	perfTest: function() {
		console.profile("Starting...");
		this.updateBeliefs_local(_=> {
			console.profileEnd("Stopped.");
			console.debug(this.nodes);
		}, 1000);
	},
	async perfCheck() {
		console.log('perf check');
		var t, dt, st = 0;
		for (var i=0; i<this.perfLoops; i++) {
			t = performance.now();
			await new Promise(resolve => this.updateBeliefs_local(resolve, this.perfIterations));
			dt = performance.now() - t;
			st += dt;
		}
		alert(st/this.perfLoops);
	},
	perfCheckWorker: function() {
		var bn = this;
		var t, dt, st = 0;
		var i = -1;
		t = performance.now();
		(function u() {
			i++;
			if (i>0) {
				dt = performance.now() - t;
				st += dt;
			}
			if (i<bn.perfLoops) {
				t = performance.now();
				bn.updateBeliefs_worker(u, bn.perfIterations);
			}
			else {
				alert(st/bn.perfLoops);
			}
		})();
	},
	/// nodeRef: for now, the id as a string
	getBeliefs: function(nodeRef) {

	},
	getAllBeliefs: function() {

	},
	getDbnNodeInstances: function(id) {
		var sliceNum = 0;
		var sliceNodes = [];

		while (true) {
			var sliceNode = this.nodesById[id+(sliceNum==0 ? "" : "_"+sliceNum)];
			if (!sliceNode)  break;

			sliceNodes.push(sliceNode);
			sliceNum++;
		}

		return sliceNodes;
	},
	/// XXX: What does this function do?
	setNodeStates: function(nodes, state) {
		for (var i=0; i<nodes.length; i++) {
			this.evidence[nodes[i].id] = state;
		}
	},
	getDbnBeliefs: function(id) {
		var sliceNum = 0;
		var allBeliefs = [];

		while (true) {
			var sliceNode = this.nodesById[id+(sliceNum==0 ? "" : "_"+sliceNum)];
			if (!sliceNode)  break;
			allBeliefs.push(sliceNode.beliefs);
			sliceNum++;
		}

		return allBeliefs;
	},
	findAllPathsBetweenNodes: function(sourceNode, destNode) {
		if (typeof(sourceNode)=="string")  sourceNode = this.nodesById[sourceNode];
		if (typeof(destNode)=="string")  destNode = this.nodesById[destNode];
		var pathsFound = [];
		var totalI = 0;

		function loop(currentNode, currentPath) {
			totalI++;
			console.log('xxx:', currentPath, currentNode, pathsFound.length);
			if (pathsFound.length > 30) return;
			var toVisit = currentNode.parents.concat(currentNode.children);
			for (var i=0; i<toVisit.length; i++) {
				var nextNode = toVisit[i];
				/// Would give cycle, so skip
				if (currentPath.indexOf(nextNode)!=-1)  continue;

				/// Found our destNode. Save, and skip this node
				if (nextNode == destNode) {
					pathsFound.push(currentPath.concat(nextNode));
					continue;
				}

				/// Keep searching from this node
				loop(nextNode, currentPath.concat(nextNode));
			}
			/// Couldn't find destNode, return nothing
		}
		loop(sourceNode, [sourceNode]);

		console.log("totalI:", totalI);

		return pathsFound;
	},
	areNodesDConnected: function(sourceNode, destNode) {
		var paths = this.findAllPathsBetweenNodes(sourceNode, destNode);
		var dConnected = false;

		for (var i=0; i<paths.length; i++) {
			var path = paths[i];

			if (this.isConnectedPath(path)) {
				dConnected = true;
				break;
			}
		}

		return dConnected;
	},
	/// Checks that the path is d-connected. If |checkFrom| (an int index in path) is given
	/// the path is assumed to be d-connected up to that index point in the path.
	isConnectedPath: function(path, checkFrom) {
		//return true;
		var pathBlocked = false;
		/// If path has only 1 or two nodes, then nodes
		/// are connected so long as neither of them have evidence
		if (path.length == 1)  return !(path[0].id in this.evidence);
		if (path.length == 2)  return !(path[0].id in this.evidence || path[1].id in this.evidence);

		if (!checkFrom)  checkFrom=2;

		for (var j=checkFrom; j<path.length; j++) {
			var curNode = path[j-1];
			/// If there is evidence on j-2 or j, then path is blocked. Why? Because,
			/// j-2 (j) is either not a collider, and hence blockable by evidence; or (j-2) j
			/// *is* a collider, in which case j-1 is *not* a collider, and hence blockable
			/// by evidence on j-2 (j)
			if (path[j-2].id in this.evidence || path[j].id in this.evidence) {
				pathBlocked = true;
				break;
			}
			if (curNode.isParent(path[j]) || curNode.isParent(path[j-2])) {
				//console.log('normal:', curNode.id);
				/// If either is an outgoing arc, then path is blockable by evidence on this node
				if (curNode.id in this.evidence) {
					pathBlocked = true;
					break;
				}
			}
			else {
				//console.log('collider:', curNode.id);;
				/// If collider, then path is only unblockable by evidence on this node or descendents
				/// Scan through all descendents to see if evidence set
				var evNodes = [];
				for (var evId in this.evidence) {
					evNodes.push(this.nodesById[evId]);
				}
				if (!curNode.hasDescendent(evNodes, true)) {
					pathBlocked = true;
					break;
				}
			}
		}

		return !pathBlocked;
	},
	findAllDConnectedNodes2: function(sourceNode, o = {}) {
		o.includeEvidence ??= false;
		o.stopIf ??= _=>false;
		o.stopAfter ??= _=>false;
		var bn = this;
		if (typeof(sourceNode)=="string")  sourceNode = this.nodesById[sourceNode];

		var upVisited = {};
		var downVisited = {};
		var toUpVisit = [sourceNode];
		var toDownVisit = [sourceNode];
		var connectedNodes = {};
		var evConnectedNodes = {};

		while (toUpVisit.length || toDownVisit.length) {
			while (toUpVisit.length) {
				var nextNode = toUpVisit.shift();
				if (o.stopIf(nextNode))  continue;
				//onsole.log("toUpVisit:", nextNode);
				if (!upVisited[nextNode.id]) {
					upVisited[nextNode.id] = true;
					/// If this node has no evidence, can go both up and down
					/// Otherwise, can't go up or down any further
					if (!(nextNode.id in this.evidence)) {
						connectedNodes[nextNode.id] = true;
						if (!o.stopAfter(nextNode)) {
							for (var i=0; i<nextNode.parents.length; i++) {
								var parent = nextNode.parents[i];
								toUpVisit.push(parent);
							}
							for (var i=0; i<nextNode.children.length; i++) {
								var child = nextNode.children[i];
								toDownVisit.push(child);
							}
						}
					}
					else {
						if (o.includeEvidence) {
							evConnectedNodes[nextNode.id] = true;
						}
					}
				}
			}
			while (toDownVisit.length) {
				var nextNode = toDownVisit.shift();
				if (o.stopIf(nextNode))  continue;
				//onsole.log("toDownVisit:", nextNode);
				if (!downVisited[nextNode.id]) {
					downVisited[nextNode.id] = true;
					/// If this node has no evidence, then can go down, but not up
					/// Otherwise, can go up, but not down
					if (!(nextNode.id in this.evidence)) {
						connectedNodes[nextNode.id] = true;
						if (!o.stopAfter(nextNode)) {
							for (var i=0; i<nextNode.children.length; i++) {
								var child = nextNode.children[i];
								toDownVisit.push(child);
							}
						}
					}
					else {
						if (!o.stopAfter(nextNode)) {
							for (var i=0; i<nextNode.parents.length; i++) {
								var parent = nextNode.parents[i];
								toUpVisit.push(parent);
							}
						}
						if (o.includeEvidence) {
							evConnectedNodes[nextNode.id] = true;
						}
					}
				}
			}
		}

		var ret = [];
		for (var nodeId in connectedNodes) {
			ret.push(this.nodesById[nodeId]);
		}
		for (var nodeId in evConnectedNodes) {
			ret.push(this.nodesById[nodeId]);
		}

		return ret;
	},
	findAllDConnectedPaths2(sourceNode, destNode, o = {}) {
		o.includeEvidence ??= false;
		o.stopIf ??= _=>false;
		o.stopAfter ??= _=>false;
		var bn = this;
		if (typeof(sourceNode)=="string")  sourceNode = this.nodesById[sourceNode];
		if (typeof(destNode)=="string")  destNode = this.nodesById[destNode];

		var upVisited = {};
		var downVisited = {};
		var toUpVisit = [sourceNode];
		var toDownVisit = [sourceNode];
		var connectedNodes = {};
		var evConnectedNodes = {};
		// var searchRoot = {node: sourceNode, from: []};
		var searchDone = {};
		var addSearchDone = (node,dir,fromNode,fromDir) => {
			if (fromDir=='up' && fromNode.hasEvidence())  return;
			if (fromDir=='down') {
				if (fromNode.hasEvidence() && dir == 'down')  return;
				if (!fromNode.hasEvidence() && dir == 'up')  return;
			}
			let key = `${node.id}-${dir}`;
			let newEntry = key in searchDone ? searchDone[key] : (searchDone[key] = {node, dir, from: []});
			let fromKey = `${fromNode.id}-${fromDir}`;
			newEntry.from.push(searchDone[fromKey]);
		};
		searchDone[`${sourceNode.id}-up`] = {node:sourceNode,dir:'up',from:[]};
		searchDone[`${sourceNode.id}-down`] = {node:sourceNode,dir:'down',from:[]};

		while (toUpVisit.length || toDownVisit.length) {
			console.log(toUpVisit.map(n => n.id), toDownVisit.map(n => n.id));
			while (toUpVisit.length) {
				// console.log(toUpVisit.map(n => n.id));
				var nextNode = toUpVisit.shift();
				if (o.stopIf(nextNode))  continue;
				//onsole.log("toUpVisit:", nextNode);
				if (!upVisited[nextNode.id]) {
					upVisited[nextNode.id] = true;
					/// If this node has no evidence, can go both up and down
					/// Otherwise, can't go up or down any further
					if (!(nextNode.id in this.evidence)) {
						connectedNodes[nextNode.id] = true;
						if (!o.stopAfter(nextNode)) {
							for (var i=0; i<nextNode.parents.length; i++) {
								var parent = nextNode.parents[i];
								toUpVisit.push(parent);
								addSearchDone(parent, 'up', nextNode, 'up');
							}
							for (var i=0; i<nextNode.children.length; i++) {
								var child = nextNode.children[i];
								toDownVisit.push(child);
								addSearchDone(child, 'down', nextNode, 'up');
							}
						}
					}
					else {
						if (o.includeEvidence) {
							evConnectedNodes[nextNode.id] = true;
						}
					}
				}
			}
			while (toDownVisit.length) {
				// console.log(toDownVisit.map(n => n.id));
				var nextNode = toDownVisit.shift();
				if (o.stopIf(nextNode))  continue;
				//onsole.log("toDownVisit:", nextNode);
				if (!downVisited[nextNode.id]) {
					downVisited[nextNode.id] = true;
					/// If this node has no evidence, then can go down, but not up
					/// Otherwise, can go up, but not down
					if (!(nextNode.id in this.evidence)) {
						connectedNodes[nextNode.id] = true;
						if (!o.stopAfter(nextNode)) {
							for (var i=0; i<nextNode.children.length; i++) {
								var child = nextNode.children[i];
								toDownVisit.push(child);
								addSearchDone(child, 'down', nextNode, 'down');
							}
						}
					}
					else {
						if (!o.stopAfter(nextNode)) {
							for (var i=0; i<nextNode.parents.length; i++) {
								var parent = nextNode.parents[i];
								toUpVisit.push(parent);
								addSearchDone(parent, 'up', nextNode, 'down');
							}
						}
						if (o.includeEvidence) {
							evConnectedNodes[nextNode.id] = true;
						}
					}
				}
			}
		}
		
		function findPaths(curNode, visited = new Set()) {
			visited = new Set(visited).add(curNode);
			let upFrom = searchDone[`${curNode.id}-up`]?.from ?? [];
			let downFrom = searchDone[`${curNode.id}-down`]?.from ?? [];
			let allFrom = upFrom.concat(downFrom);
			let s = new Set(allFrom.map(entry => entry.node));
			let nextPaths = [...s].filter(n => !visited.has(n)).map(nextNode => findPaths(nextNode, visited).map(path => [curNode].concat(path))).flat();
			//console.log(nextPaths);
			return nextPaths.length ? nextPaths : [[curNode]];
		}
		function hasLoop(path) {
			let visited = new Set();
			for (let i=0; i<path.length-1; i++) {
				let key = `${path[i].id}-${path[i+1].id}`;
				if (visited.has(key)) {
					return true;
				}
				visited.add(key);
			}
			return false;
		}
		function hasLoop(path) {
			let visited = new Set();
			for (let i=0; i<path.length; i++) {
				let key = `${path[i].id}`;
				if (visited.has(key)) {
					return true;
				}
				visited.add(key);
			}
			return false;
		}
		function findPaths(curNode, curPath = []) {
			let checkUp = true;
			let checkDown = true;
			if (curPath.at(-1)) {
				if (curNode.children.includes(curPath.at(-1))) {
					checkUp = checkDown = !curNode.hasEvidence();
				}
				else {
					let descEvidence = curNode.getDescendants().map(n => n.hasEvidence()).reduce((a,v)=>a+v,0);
					checkDown = curNode.hasEvidence() || descEvidence;
					checkUp = !curNode.hasEvidence();
				}
			}
			let upFrom = searchDone[`${curNode.id}-up`]?.from ?? [];
			let downFrom = searchDone[`${curNode.id}-down`]?.from ?? [];
			let allFrom = (checkUp ? upFrom : []).concat(checkDown ? downFrom : []);
			let s = new Set(allFrom.map(entry => entry.node));
			curPath = curPath.slice(); curPath.push(curNode);
			let nextPaths = [];
			if (hasLoop(curPath)) {
				return [];
			}
			else {
				nextPaths = [...s].map(nextNode => findPaths(nextNode, curPath).map(path => [curNode].concat(path))).flat();
			}
			if (nextPaths.length) {
				return nextPaths;
			}
			else if (curNode == sourceNode) {
				return [[curNode]];
			}
			return [];
			//console.log(nextPaths);
			// return nextPaths.length ? nextPaths : [[curNode]];
		}
		function hasLoop(path) {
			let visited = new Set();
			for (let i=0; i<path.length; i++) {
				let key = `${path[i].node.id}-${path[i].dir}`;
				if (visited.has(key)) {
					return true;
				}
				visited.add(key);
			}
			return false;
		}
		function findPaths(curNodeVisit, curPath = []) {
			let checkUp = true;
			let checkDown = true;
			if (curPath.at(-1)) {
				if (curNodeVisit.node.children.includes(curPath.at(-1).node)) {
					checkUp = checkDown = !curNodeVisit.node.hasEvidence();
				}
				else {
					checkDown = curNodeVisit.node.hasEvidence();
					checkUp = !curNodeVisit.node.hasEvidence();
				}
			}
			let upFrom = searchDone[`${curNodeVisit.node.id}-up`]?.from ?? [];
			let downFrom = searchDone[`${curNodeVisit.node.id}-down`]?.from ?? [];
			let allFrom = (checkUp ? upFrom : []).concat(checkDown ? downFrom : []);
			let s = new Set(allFrom);
			curPath = curPath.slice(); curPath.push(curNodeVisit);
			let nextPaths = [];
			if (hasLoop(curPath)) {
				return [];
			}
			else {
				nextPaths = [...s].map(nextNode => findPaths(nextNode, curPath).map(path => [curNodeVisit].concat(path))).flat();
			}
			if (nextPaths.length) {
				return nextPaths;
			}
			else if (curNodeVisit.node == sourceNode) {
				return [[curNodeVisit]];
			}
			return [];
			//console.log(nextPaths);
			// return nextPaths.length ? nextPaths : [[curNode]];
		}
		if (searchDone[`${sourceNode.id}-up`])  searchDone[`${sourceNode.id}-up`].from = [];
		if (searchDone[`${sourceNode.id}-down`])  searchDone[`${sourceNode.id}-down`].from = [];
		
		let nv = searchDone[`${destNode.id}-up`] ?? searchDone[`${destNode.id}-down`];
		let paths = findPaths(nv);
		console.log(paths);
		return paths.map(path => path.map(nv => nv.node)); //.filter(path => path.at(-1)==sourceNode);

		var ret = [];
		for (var nodeId in connectedNodes) {
			ret.push(this.nodesById[nodeId]);
		}
		for (var nodeId in evConnectedNodes) {
			ret.push(this.nodesById[nodeId]);
		}

		return ret;
	},
	findAllDConnectedPaths3(sourceNode, destNode, o = {}) {
		if (typeof(sourceNode)=="string")  sourceNode = this.nodesById[sourceNode];
		if (typeof(destNode)=="string")  destNode = this.nodesById[destNode];
		
		let PARENTS = 0b01;
		let CHILDREN = 0b10;
		let PARENTSANDCHILDREN = 0b11;

		function hasLoop(path, end) {
			for (let i=path.length-1; i>=0; i--) {
				if (end[0] == path[i][0] && (path[i][1]==PARENTSANDCHILDREN || end[1]==path[i][1])) {
					return true;
				}
			}
			return false;
		}
		function hasLoop(path, end) {
			for (let i=path.length-1; i>=0; i--) {
				if (end[0] == path[i][0]) {
					return true;
				}
			}
			return false;
		}
		
		let downstreamEv = Object.fromEntries(this.nodes.map(n => [n.id, n.getDescendants().map(n=>n.hasEvidence()).reduce((a,v)=>a+v,0)]));
		console.log(downstreamEv);

		let pathsQueue = [[[sourceNode, PARENTSANDCHILDREN]]];
		let foundPaths = [];
		while (pathsQueue.length) {
			let currentPath = pathsQueue.shift();
			
			let currentNode = currentPath.at(-1)[0];
			if (currentNode == destNode) {
				// foundPaths.push(currentPath.map(entry => entry[0].id).join(' - '));
				foundPaths.push(currentPath.map(entry => entry[0]));
			}
			else {
				if ((currentPath.at(-1)[1]&PARENTS)==PARENTS) {
					let nextPaths = currentNode.parents
						.filter(p => !p.hasEvidence() && !hasLoop(currentPath,[p,PARENTSANDCHILDREN]))
						.map(p => currentPath.concat([[p,PARENTSANDCHILDREN]]));
					pathsQueue.push(...nextPaths);
				}
				if ((currentPath.at(-1)[1]&CHILDREN)==CHILDREN) {
					let nextPaths = currentNode.children
						.filter(c => !hasLoop(currentPath,[c, c.hasEvidence()?PARENTS:(downstreamEv[c.id]?PARENTSANDCHILDREN:CHILDREN)]))
						.map(c => currentPath.concat([[c, c.hasEvidence()?PARENTS:(downstreamEv[c.id]?PARENTSANDCHILDREN:CHILDREN)]]));
					pathsQueue.push(...nextPaths);
				}
			}
		}
		
		return foundPaths;
	},
	findAllDConnectedNodes3(sourceNode, destNode, o = {}) {
		if (typeof(sourceNode)=="string")  sourceNode = this.nodesById[sourceNode];
		if (typeof(destNode)=="string")  destNode = this.nodesById[destNode];
		
		let PARENTS = 0b01;
		let CHILDREN = 0b10;
		let PARENTSANDCHILDREN = 0b11;

		// function hasLoop(path, end) {
			// for (let i=path.length-1; i>=0; i--) {
				// if (end[0] == path[i][0] && (path[i][1]==PARENTSANDCHILDREN || end[1]==path[i][1])) {
					// return true;
				// }
			// }
			// return false;
		// }
		// function hasLoop(path, end) {
			// for (let i=path.length-1; i>=0; i--) {
				// if (end[0] == path[i][0]) {
					// return true;
				// }
			// }
			// return false;
		// }
		let visited = new Set();
		function hasLoop(path, end) {
			return visited.has(`${end[0].id}-${end[1]}`);
		}
		
		let downstreamEv = Object.fromEntries(this.nodes.map(n => [n.id, n.getDescendants().map(n=>n.hasEvidence()).reduce((a,v)=>a+v,0)]));
		console.log(downstreamEv);

		let nodeDirQueue = [[sourceNode, PARENTS, null],[sourceNode, CHILDREN, null]];
		let resolved = {};
		let foundPaths = [];
		
		function resolveUp(nodeDir, howResolved) {
			let nextPrevNodeDir = nodeDir;
			while (nextPrevNodeDir) {
				let key = `${nextPrevNodeDir[0].id}-${nextPrevNodeDir[1]}`;
				//if (resolved[key] !== undefined)  break;
				resolved[key] = howResolved;
				nextPrevNodeDir = nextPrevNodeDir[2];
			}
		}
		
		while (nodeDirQueue.length) {
			let currentNodeDir = nodeDirQueue.shift();
			
			let key = `${currentNodeDir[0].id}-${currentNodeDir[1]}`;
			if (resolved[key]!==undefined) {
				resolveUp(currentNodeDir, resolved[key]);
				continue;
			}
			
			let currentNode = currentNodeDir[0];
			if (currentNode == destNode) {
				// foundPaths.push(currentNodeDir.map(entry => entry[0].id).join(' - '));
				resolveUp(currentNodeDir, true);
				continue;
			}
			
			if (currentNodeDir[1]==PARENTS) {
				visited.add(`${currentNodeDir[0].id}-${PARENTS}`);
				let nextNodeDirs = currentNode.parents
					.filter(p => !p.hasEvidence() && !visited.has(`${p.id}-${PARENTS}`))
					.map(p => [p,PARENTS,currentNodeDir]);
				nodeDirQueue.unshift(...nextNodeDirs);
				nextNodeDirs = currentNode.parents
					.filter(p => !p.hasEvidence() && !visited.has(`${p.id}-${CHILDREN}`))
					.map(p => [p,CHILDREN,currentNodeDir]);
				nodeDirQueue.unshift(...nextNodeDirs);
			}
			if (currentNodeDir[1]==CHILDREN) {
				visited.add(`${currentNodeDir[0].id}-${CHILDREN}`);
				let nextNodeDirs = currentNode.children
					.map(c => [c, c.hasEvidence()?PARENTS:(downstreamEv[c.id]?PARENTSANDCHILDREN:CHILDREN), currentNodeDir]);
				for (let nodeDir of nextNodeDirs) {
					if (nodeDir[1]==PARENTSANDCHILDREN) {
						let parentsNodeDir = nodeDir;
						let childrenNodeDir = nodeDir.slice();
						parentsNodeDir[1] = PARENTS;
						childrenNodeDir[1] = CHILDREN;
						if (!visited.has(`${parentsNodeDir[0].id}-${parentsNodeDir[1]}`))  nodeDirQueue.unshift(parentsNodeDir);
						if (!visited.has(`${childrenNodeDir[0].id}-${childrenNodeDir[1]}`))  nodeDirQueue.unshift(childrenNodeDir);
					}
					else {
						nodeDirQueue.unshift(nodeDir);
					}
				}
			}
		}
		
		return Object.entries(resolved).filter(([k,v]) => v).map(([k,v]) => this.node[k.slice(0,-2)]);
		
		// return Object.keys;
	},
	findAllDConnectedNodes4(sourceNode, destNode, o = {}) {
		o.arcTraversal ??= false;
		o.arcs = o.arcTraversal || (o.arcs ?? false);
		o.noSourceParents ??= false;
		o.noSourceChildren ??= false;
		if (typeof(sourceNode)=="string")  sourceNode = this.nodesById[sourceNode];
		if (typeof(destNode)=="string")  destNode = this.nodesById[destNode];
		
		let PARENTS = 0b01;
		let CHILDREN = 0b10;
		let PARENTSANDCHILDREN = 0b11;

		function hasLoop(path, end) {
			for (let i=path.length-1; i>=0; i--) {
				if (end[0] == path[i][0] && (path[i][1]==PARENTSANDCHILDREN || end[1]==path[i][1])) {
					return true;
				}
			}
			return false;
		}
		function hasLoop(path, end) {
			for (let i=path.length-1; i>=0; i--) {
				if (end[0] == path[i][0]) {
					return true;
				}
			}
			return false;
		}
		
		let downstreamEv = Object.fromEntries(this.nodes.map(n => [n.id, n.getDescendants().map(n=>n.hasEvidence()).reduce((a,v)=>a+v,0)]));
		console.log(downstreamEv);

		let pathsQueue = [[[sourceNode, PARENTSANDCHILDREN]]];
		let foundPaths = [];
		let resolved = {};
		let arcs = new Set();
		
		let nodeDirKey = nodeDir => `${nodeDir[0].id}-${nodeDir[1]}`
		function resolvePath(path, howResolved = true) {
			console.log(path);
			let prevNodeDir = null;
			for (let currentNodeDir of path) {
				if (prevNodeDir) {
					let par = prevNodeDir[0], child = currentNodeDir[0];
					let swap = child.isParent(par);
					if (swap)  [par,child] = [child,par];
					if (o.arcTraversal) {
						if (!swap)  arcs.add(`${par.id}-${child.id}|down`);
						else        arcs.add(`${par.id}-${child.id}|up`);
					}
					else {
						arcs.add(`${par.id}-${child.id}`);
					}
				}
				resolved[nodeDirKey(currentNodeDir)] = howResolved ? currentNodeDir[0] : false;
				prevNodeDir = currentNodeDir;
			}
		}
		function nodeDirIsResolved(nodeDir) {
			return Boolean(resolved[nodeDirKey(nodeDir)]);
		}
		let checkedBefore = 0;
		let checkedAfter = 0;
		while (pathsQueue.length) {
			let currentPath = pathsQueue.shift();
			
			checkedBefore++;
			if (nodeDirIsResolved(currentPath.at(-1))) {
				resolvePath(currentPath);
				continue;
			}
			checkedAfter++;
			
			let currentNode = currentPath.at(-1)[0];
			if (currentNode == destNode) {
				// foundPaths.push(currentPath.map(entry => entry[0].id).join(' - '));
				// foundPaths.push(currentPath.map(entry => entry[0]));
				resolvePath(currentPath);
			}
			else {
				let checkParents = !currentNode.intervene && (!o.noSourceParents || currentNode != sourceNode);
				let checkChildren = !o.noSourceChildren || currentNode != sourceNode;
				if (checkParents && (currentPath.at(-1)[1]&PARENTS)==PARENTS) {
					let nextPaths = currentNode.parents
						.filter(p => !p.hasEvidence() && !hasLoop(currentPath,[p,PARENTSANDCHILDREN]))
						.map(p => currentPath.concat([[p,PARENTSANDCHILDREN]]));
					pathsQueue.push(...nextPaths);
				}
				if (checkChildren && (currentPath.at(-1)[1]&CHILDREN)==CHILDREN) {
					let nextPaths = currentNode.children
						.filter(c => !hasLoop(currentPath,[c, c.hasEvidence()?PARENTS:(downstreamEv[c.id]?PARENTSANDCHILDREN:CHILDREN)]))
						.map(c => currentPath.concat([[c, c.hasEvidence()?PARENTS:(downstreamEv[c.id]?PARENTSANDCHILDREN:CHILDREN)]]));
					pathsQueue.push(...nextPaths);
				}
			}
		}
		console.log(checkedBefore, '/', checkedAfter);
		
		if (o.arcs) {
			return [...arcs];
		}
		return [...new Set(Object.values(resolved))];
	},
	findAllDConnectedNodes: function(sourceNode) {
		/// To Do
		var bn = this;
		if (typeof(sourceNode)=="string")  sourceNode = this.nodesById[sourceNode];
		var connectedNodes = {};
		var directConnectedNodes = {};
		var directionVisited = {};
		var pathsFound = [];
		var _nodeVisits = 0;
		var _dconnectedExits = 0;

		function loop(currentNode, currentPath) {
			_nodeVisits++;
			var toVisit = currentNode.parents.concat(currentNode.children);
			for (var i=0; i<toVisit.length; i++) {
				var nextNode = toVisit[i];
				/// We already know this node is connected
				//if (nextNode.id in connectedNodes)  continue;
				/// Would give cycle, so skip
				if (currentPath.indexOf(nextNode)!=-1)  continue;
				/// If we already know this node, and the next node is connected,
				/// we've already explored this path in every relevant way, so truncate
				//if (directConnectedNodes[currentNode.id+'|'+nextNode.id]) { _dconnectedExits++;  continue; }

				var nextPath = currentPath.concat(nextNode);
				currentPath.slice

				/// If we don't already know it's connected, check if it is connected
				if (!(nextNode.id in connectedNodes)) {
					if (bn.isConnectedPath(nextPath, nextPath.length-1)) {
						connectedNodes[nextNode.id] = true;

						//directConnectedNodes[currentNode.id+"|"+nextNode.id] = true;
					}
					else {
						/// There's a problem here to be fixed for colliders with evidence
						continue;
					}
				}

				/// Keep searching from this node
				if (!directionVisited[nextNode.id+'|'+nextNode.isParent(currentNode)]) {
					directionVisited[nextNode.id+'|'+nextNode.isParent(currentNode)] = true;
					loop(nextNode, nextPath);
				}
			}
			/// Couldn't find destNode, return nothing
		}
		loop(sourceNode, [sourceNode]);

		console.log("_nodeVisits", _nodeVisits);
		console.log("_dconnectedExits", _dconnectedExits);

		var ret = [];
		for (var nodeId in connectedNodes) {
			ret.push(this.nodesById[nodeId]);
		}

		return ret;
	},

	checkCycle(from, to) {
		return from.hasAncestor(to);
	},

	/// Reference management
	removeNodeRefs(node) {
		for (let nodeListType of ['nodes','_rootNodes','_decisionNodes','_utilityNodes','_nodeOrdering']) {
			let index = this[nodeListType].findIndex(n => n.id == node.id);
			if (index !== -1)  this[nodeListType].splice(index, 1);
		}
		delete this.nodesById[node.id];
		/// BNs are also submodels
		Submodel.prototype.removeNodeRefs.call(this, node);
	},
});
addDefaultSetters(BN);
addDefaultSetters(Node);
addDefaultSetters(State);

if (typeof(exports)!="undefined") {
	exports.BN = BN;
	exports.Node = Node;
	exports.Submodel = Submodel;
}
