/** This whole section needs to change **/
var TEMP_USEJTREE = false;
var useWorkers = TEMP_USEJTREE ? false : true;
if (typeof($)=="undefined") {
	/// XXX Quick hack to suppress ordinary console.logs in the API
	/// XXX Fix by actually removing unnecessary console.log statements!
	console.apilog = console.log;
	console.log = function(){}

	$ = require('cheerio');
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
	bu = require('./beliefUpdate_worker.js');

	function genPass(length) {
		var pwd;
		pwd = "";
		for (i=0;i<length;i++) {
			pwd += String.fromCharCode(Math.floor((Math.random()*25+65)));
		}
		return pwd.toLowerCase();
	}
	useWorkers = false;
}

var titlePostfix = typeof(document)!="undefined" ? document.title : ""; /// Valid on load, but not any other time of course
var openBns = [];
var openData = [];
var currentBn = null;

/// Adds a default |setXXX| function for every property in the object,
/// unless one is already specified in the chain. This should be called
/// on the constructor (i.e. addDefaultSetters(Object)) as well as
/// *inside* the constructor at the end of property initialisations
/// (i.e. addDefaultSetters(this)).
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

if (!Array.prototype.findIndex) {
  Object.defineProperty(Array.prototype, 'findIndex', {value: function(predicate) {
	if (this === null) {
	  throw new TypeError('Array.prototype.findIndex called on null or undefined');
	}
	if (typeof predicate !== 'function') {
	  throw new TypeError('predicate must be a function');
	}
	var list = Object(this);
	var length = list.length >>> 0;
	var thisArg = arguments[1];
	var value;

	for (var i = 0; i < length; i++) {
	  value = list[i];
	  if (predicate.call(thisArg, value, i, list)) {
		return i;
	  }
	}
	return -1;
  }});
}

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

/// Inconsistencies between html and svg are very annoying
function makeSvg(tag, attrs) {
	var el= document.createElementNS('http://www.w3.org/2000/svg', tag);
	for (var k in attrs) {
		el.setAttribute(k, attrs[k]);
	}
	return el;
}

String.prototype._splitNotEmpty = function() {
	return this.length==0 ? [] : this.split.apply(this, arguments);
}

function getQs() {
	var params = {};
	var argSpecs = window.location.search.substring(1).split('&');
	if (window.location.search) {
		for (var i in argSpecs) {
			var argInfo = argSpecs[i].split('=');
			params[unescape(argInfo[0])] = unescape(argInfo[1]);
		}
	}
	return params;
}

if (typeof(window)!="undefined")  window.qs = getQs();

function loadFile() {
	$("#openFile").click();
}

function baseName(fileName) {
	var m = fileName.match(/[^/]*$/);
	if (m) {
		return m[0];
	}
	return null;
}

/**
	@file: a file object, from (e.g.) an <input> or a |event.dataTransfer.files| object
*/
function fileLoaded(file, callback) {
	var fileExts = {xdsl:true,dne:true};

	var fileName = baseName(file.name);
	var format = file.name.replace(/^.*\.([^.]*)$/, '$1');
	/// Assume xdsl if extension not recognised (XXX probably should at least throw a warning before
	/// the inevitable failure to load anything)
	console.log(format);
	if (!fileExts[format]) {
		format = "xdsl";
	}

	//onsole.debug(file);
	var reader = new FileReader();
	reader.onload = function(e) {
		openBns.push(new BN({source: e.target.result, outputEl: $(".bnview"), format: format, fileName: fileName}));
		currentBn = openBns[openBns.length-1];
		if (callback)  callback();
	}
	reader.readAsText(file);
}

/// Loads the file of the given name/path from the server via XHR, and
/// then calls the callback
function loadFromServer(fileName, callback) {
	var fileExts = {xdsl:true,dne:true};
	var format = fileName.replace(/^.*\.([^.]*)$/, '$1');
	if (!fileExts[format]) {
		format = "xdsl";
	}
	$.get(fileName, function(data) {
		openBns.push(new BN({source: data, outputEl: $(".bnview"), format: format, fileName: baseName(fileName)}));
		currentBn = openBns[openBns.length-1];
		if (callback)  callback();
	}, "text");
}

function readChosenFile(inp, callback) {
	var file = inp.files[0];
	console.debug(file);
	var reader = new FileReader();
	reader.onload = function(e) {
		if (callback)  callback(e.target.result, e);
	}
	reader.readAsText(file);
}

function loadTabbedData(text) {
	var lines = text.replace(/^\s*|\s*$/g, '').split(/\r?\n/);
	var data = [];
	for (var ent of lines.entries()) {
		var i = ent[0], line = ent[1];
		lines[i] = line.split(/\t/);
		if (i>0) {
			var row = {};
			for (var ent of lines[0].entries()) { var hi=ent[0],header=ent[1]; row[header] = lines[i][hi]; }
			data.push(row);
		}
	}
	openData.push(data);
}

function updateBN(callback) {
	currentBn.updateAndDisplayBeliefs(null, callback);
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

/// Count the number of state combinations across all nodes in |nodes|
function numNodeStateCombinations(nodes) {
	var numNodeStates = 1;
	for (var j=0; j<nodes.length; j++) {
		numNodeStates *= nodes[j].states.length;
	}
	return numNodeStates;
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

/** Dialogs **/
function popupDialog($a, opts) {
	var opts = opts || {};
	opts.buttons = opts.buttons || [];
	opts.className = opts.className || "";

	/// $a could be a string, element or jquery element
	$a = $("<div class=dialog>")
		.addClass(opts.className)
		.html($a)
		.appendTo("body");

	/// Add controls
	$a.append($('<div class=controls>').append(opts.buttons));

	var $veil = $("<div class=veil>").width($(window).width()).height($(window).height())
		.css({opacity: 0})
		.animate({opacity: 0.5}, 300)
		.appendTo($("body"));


	var w = $a.outerWidth(),
		h = $a.outerHeight();
	$a.fadeIn(300);

	$a.css({left: (($(window).width() - w)/2)+"px"});
	$a.css({top:(($(window).height() - h)/2)+"px"});

	$a.data("veil", $veil);
	
	return $a;
}

function reportError(msg) {
	popupDialog(msg+"<div class=controls><button type=button onclick=dismissDialogs()>OK</button></div>");
}

function dismissDialog($a, callback) {
	$a.fadeOut(300);
	$a.data("veil").animate({opacity: 0}, 300, function() { $(this).hide(); if (typeof(callback)=="function")  callback(); });
	$a.data("veil").remove();
	$a.remove();
}

function dismissDialogs(callback) {
	var first = true;
	var $dialogs = $();
	$(".dialog:visible").each(function() {
		$dialogs.add(dismissDialog($(this), first ? callback : null));
		first = false;
	});
}

function nyi() {
	popupDialog('Not yet implemented :(', {buttons:[
		$('<button type=button>OK</button>').click(dismissDialogs),
	]});
}

function popupEditDialog($content, opts) {
	popupDialog($content, {
		className: 'contextMenu '+opts.className,
		buttons: [
			$('<button type=button class=saveButton disabled>').html('Save').on('click', function() {
				$(".dialog .saveButton")[0].disabled = true;
				console.log(whatsDirty);
				var controls = opts.controls;
				var success = true;
				for (var control in controls) {
					if (whatsDirty[control]) {
						whatsDirty[control] = false;
						/**
						Validity needs to be checked for all controls *first* (to avoid partial updates), but that's not
						the case right now.

						Currently, change events should be checked in order of failure priority.
						XXX: This needs fixing.
						*/
						if ($('.dialog *[data-control='+control+']').is('input, select, textarea')) {
							//var valid = $('.dialog *[data-control='+control+']').get().map(a=>$(a).is(':valid')).reduce((a,b)=>a && b);
							var valid = $('.dialog *[data-control='+control+']').get().map(function(a){return $(a).is(':valid')}).reduce(function(a,b){return a && b});
							if (valid) {
								var $control = $('.dialog *[data-control='+control+']');
								var val = $control.val();
								/// 'false' specifically means change didn't save
								if (controls[control].change(val, $control)===false) {
									$(".dialog .saveButton")[0].disabled = false;
									whatsDirty[control] = true;
									success = false;

									/// XXX: This needs fixing. Need validate all controls first.
									return false;
								}
							}
							else {
								/// XXX: This needs fixing. Need validate all controls first.
								return false;
							}
						}
						else {
							/// Non-standard control, just call with no arguments

							/// 'false' specifically means change didn't save
							if (controls[control].change($('.dialog *[data-control='+control+']'))===false) {
								$(".dialog .saveButton")[0].disabled = false;
								whatsDirty[control] = true;
								success = false;

								/// XXX: This needs fixing. Need validate all controls first.
								return false;
							}
						}
					}
				}
				if (success && opts.onsave) {
					opts.onsave();
				}
			}),
			$('<button type=button class=closeButton>').html('Close').on('click', dismissDialogs),
		],
	});
	$(".dialog").data("whatsDirty", {})
	var whatsDirty = $(".dialog").data("whatsDirty");
	$(".dialog").on("change keyup", function(event) {
		if ($(event.target).closest('*[data-control]').length) {
			var name = $(event.target).closest('*[data-control]').data('control');
			whatsDirty[name] = true;
		}
		$(".dialog .saveButton")[0].disabled = false;
	});
}
/** End Dialogs **/

function makeValidId(str) {
	return str.replace(/[^_0-9a-zA-Z]/g, '_').replace(/^[^_a-zA-Z]/, '_$0').substr(0, 32);
}

/**
   A State is associated with discrete nodes, and defines an id for the state,
   as well it's index in the order. The index may take on more significance in
   future, once I add support for ordinal nodes in some way. Other elements may
   also be added to state in future (like, for example, values and intervals).
**/
function State(o) {
	/// The state's ID (as per GeNIe)
	this.id = null;
	/// The state's index in the node state list
	this.index = null;

	/// Set options based on constructor args
	for (var i in o) {
		this[i] = o[i];
	}
	addDefaultSetters(this);
}

/// You would not normally create this object directly.
function DisplayItem(o) {
	o = o || {};

	this.pos = {x: 0, y: 0};
	this.size = {width: null, height: null};
	/// Formatting (all at their defaults)
	this.format = {
		backgroundColor: null,
		borderColor: null,
		fontColor: null,
		fontFamily: null,
		fontSize: null,
	};
	
	Object.assign(this, o);
}

/** To create a node, call new Node({opt1:...,opt2:...}) **/
function Node(o) {
	o = o || {};

	/*
		Member vars and their defaults
	*/
	/// Every node receives a unique key (that should not be altered by
	/// the user, lest they want things to go awry!)
	this._key = genPass(10);
	/// The net to which the node belongs
	this.net = null;
	/// The node's ID (as per GeNIe)
	this.id = null;
	/// The node's label (equivalent to Netica's 'title', or GeNIe's 'name')
	this.label = null;
	/// Type of node: nature, decision, utility
	this.type = "nature";
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
	/// The utilities associated with this node's states
	this.utilities = [];
	/// The current beliefs for this node (net must have been updated separately)
	this.beliefs = null;
	/// 'counts' (per state) and 'seen' (for the whole node) are generated
	/// during simulation belief update. A little bit
	/// like 'experience' in Netica, but not really.
	this.counts = null;
	this.seen = 0;
	/// 'samples' are for continuous nodes, and are a list of all the samples
	/// created for this node
	this.samples = [];
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

	/// Does the display need updating?
	this._updateDisplay = false;

	/// Visual properties
	DisplayItem.apply(this, {size: {width: 110, height: 50}});
	/// For arc drawing/updating
	this.pathsIn = [];
	this.pathsOut = [];

	/// Set options based on constructor args
	Object.assign(this, o);

	if (!o.__noinit && new.target)  this.init({addToCanvas: o.addToCanvas});
	addDefaultSetters(this);
}
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

	console.log("OPTS:", opts);

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
		utilities: utils,
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
Node.prototype = {
	/// Most of this function involves introducing the new Node to the rest
	/// of the world
	init: function(o) {
		o = o || {};
		var node = this;

		/// Make setter do the right thing, instead of this
		if (!node.net)  node.net = null;

		node._updateDisplay = !node.engineOnly;
		
		if (!node.states || !node.states.length) {
			node.states = ["state0","state1"];
		}

		/// Convert states, if needed
		if (node.states.length && typeof(node.states[0])=="string") {
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
					parent.children.push(node);
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
					var oldChild = child.duplicateLocal();
					child.parents.push(node);
					child.def.updateChild({oldChild});
				}
			}
		}

		if (!node.id) {
			node.id = genPass(10);
		}
		
		/// Need to do this after we've handled parents and children
		if (!node.def) {
			node.def = new CPT(node);
		}

		if (this.net !== null) {
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

			if (o.addToCanvas) {
				bn.display();
				bn.updateAndDisplayBeliefs();
			}
		}
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
	///	The local fragment is NOT attached to the current network unless specified.
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
		var states = JSON.parse(JSON.stringify(this.states));
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
			this.states.splice(insertPoint, 0, new State({id: stateName, index: i}));
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
	moveStates: function(moves, opts) {
		opts = opts || {};
		var updateChildren = typeof(opts.updateChildren)=="undefined" ? true : opts.updateChildren;
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
	/// Rename this node to |newId|. If there is already a node called newId,
	/// the function emits a warning (but does not halt or stop the chaining).
	rename: function(newId) {
		var oldId = this.id;
		/// Fix newId if needed
		newId = makeValidId(newId);
		if (newId in this.net.nodesById) {
			console.log("Can't rename node because '"+newId+"' already exists.");
			return this;
		}
		delete this.net.nodesById[this.id];
		this.id = newId;
		this.net.nodesById[newId] = this;

		/// The definition may need to do something to handle renames
		if (this.def.renameNode)  this.def.renameNode(oldId, newId);

		return this;
	},
	/// The following methods are not meant to be called directly (hence the _ underscore)
	/// Call addParents instead, and pass it a list of parents (even if just one).
	_addParent: function(parent) {
		if (typeof(parent)=="string")  parent = this.net.nodesById[parent];

		/// Check that parent is not already present
		if (this.parents.findIndex(function(p) { return p == parent })==-1) {
			var oldChild = this.duplicateLocal();
			this.parents.push(parent);
			/// Some chance parents/children lists are out of sync, but if so we have bigger problems
			parent.children.push(this);

			//this.updateDefinition({type: 'parentsChanged', oldNode: oldNode});
			this.def.updateChild({oldChild});
		}
	},
	_addChild: function(child) {
		var prevChild = child;
		if (typeof(child)=="string")  child = this.net.nodesById[child];
		if (!child)  throw new Exception("No such node: "+prevChild);

		child._addParent(this);
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
			parent.children = parent.children.splice();

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
	addParents: function(parents) {
		for (var i=0; i<parents.length; i++)  this._addParent(parents[i]);
		return this;
	},
	/// Each |child| can be a string or a node
	addChildren: function(children) {
		for (var i=0; i<children.length; i++)  this._addChild(children[i]);
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
			this.utilities = utils;
			this.states = states;
			this.def = new CDT(this, funcTable);
			this.removeChildren(this.children);
		}

		this.net.needsCompile = true;

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
	/// Set the utilities for the node. This will update the state names
	/// to match the utilities, which can be useful if the node states are
	/// being viewed in the network display.
	setUtilities: function(utilities) {
		utils = utilities;
		states = utils.map(function(a,i){ return new State({id: a, index: i}) });
		funcTable = [];
		for (var i in utils) {
			funcTable[i] = Number(i);
		}

		this.utilities = utilities;
		this.states = states;
		this.def.set(funcTable);

		this.net.needsCompile = true;

		return this;
	},
	/// Set the submodel for this node by specifying a path
	setSubmodelPath: function(path) {
		/// XXX Improve validation of the path
		if (path.search(/^\//)!==-1) {
			this.moveToSubmodel(path.replace(/\/$/,'').split(/\//).slice(1));
		}

		return this;
	},
	/**
	Return a string representation of the path to this node (not including the id of the
	node itself).
	*/
	getSubmodelPathStr: function() {
		return this.submodelPath ? '/'+this.submodelPath.concat(['']).join('/') : '';
	},
	/// Move this node to the given submodel. |path| is a left-to-right array
	/// representing the path.
	moveToSubmodel: function(path) {
		/// Remove from old submodel (if there)
		var oldSubmodel = this.net.getSubmodel(this.submodelPath);
		var node = this;
		var oldIndex = oldSubmodel.subNodes.findIndex(function(v) { return v==node; });
		console.log(oldIndex);
		if (oldIndex >= 0) {
			oldSubmodel.subNodes.splice(oldIndex,1);
		}

		if (path instanceof Submodel) {
			path = path.submodelPath.concat([path.id]);
		}

		/// Save new path
		this.submodelPath = path.slice();

		/// Move node to new submodel
		this.net.getSubmodel(this.submodelPath).subNodes.push(this);
	},
	/// Create a duplicate node in the same network
	/// If null is passed for |id|, a random id is generated
	/// XXX This is not a proper duplicate function yet.
	duplicate: function(id, extraProps, dontAddToNet) {
		var nodeProps = {};
		this.duplicateInto(nodeProps, extraProps);
		if (!id)  id = genPass(10);
		if (dontAddToNet) {
			var node = Object.create(Node.prototype);
			node.id = id;
			for (var i in nodeProps) {
				node[i] = nodeProps[i];
			}
			return node;
		}
		return this.net.addNode(id, this.states.map(function(s){ return s.id }), nodeProps);
	},
	/// This is like duplicate, but overwrites |this| with (selected) properties in |node|
	/// |node| doesn't have to be an actual node, it can be an empty plain object
	duplicateInto: function(node, extraProps) {
		/// Note: net is included in the duplication, but node is *not* added to the net (i.e.
		/// there's no ref. to this node from the net, only a ref to the net from this node)
		var propsToDuplicate = {label:1,parents:1,children:1,def:1,utilities:1,
			dbnOrder:1,dynamic:1,engineOnly:1,comment:1,format:1,type:1,
			states:1,/*statesById:1,*/submodelPath:1,net:1};
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
					}
					else {
						console.log(i);
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
				else {
					console.log("definition");
					node[i] = this[i];
				}
			}
		}
		if (extraProps) {
			for (var i in extraProps) {
				node[i] = extraProps[i];
			}
		}
	},
	/// Delete this node from its network
	delete: function(opts) {
		opts = opts || {};
		/// XXX To be implemented
		opts.absorb = opts.absorb || false;
		var node = this;
		/// Remove from the net's references
		for (var nodeListType of ['nodes','_rootNodes','_decisionNodes','_utilityNodes','_nodeOrdering']) {
			var index = this.net[nodeListType].findIndex(function(n) { return n.id == node.id; });
			if (index !== -1)  this.net[nodeListType].splice(index, 1);
		}
		delete this.net.nodesById[this.id];

		/// Remove from the submodel's references
		var submodel = this.net.getSubmodel(node.submodelPath);
		var index = submodel.subNodes.findIndex(function (n) { return n.id == node.id; });
		submodel.subNodes.splice(index, 1);

		/// Remove from other node's references (in parents)
		for (var otherNode of this.net.nodes) {
			/// Can't be in/out multiple times.
			for (var nodeListType of ['pathsIn','pathsOut']) {
				var otherItem = nodeListType == 'pathsIn' ? 'parentItem' : 'childItem';
				var index = otherNode[nodeListType].findIndex(function(p) { return p[otherItem].id == node.id; });
				if (index !== -1)  otherNode[nodeListType].splice(index, 1);
			}

			/// Inefficient
			var otherSubmodel = this.net.getSubmodel(otherNode.submodelPath);
			for (var nodeListType of ['pathsIn','pathsOut']) {
				var otherItem = nodeListType == 'pathsIn' ? 'parentItem' : 'childItem';
				var index = otherSubmodel[nodeListType].findIndex(function(p) { return p[otherItem].id == node.id; });
				if (index !== -1)  otherSubmodel[nodeListType].splice(index, 1);
			}

			var asChildIndex = otherNode.children.findIndex(function(n){return n.id == node.id});
			if (asChildIndex !== -1)  otherNode.children.splice(asChildIndex, 1);

			/// If this node was a parent, we need special treatment, because it affects child definition
			var asParentIndex = otherNode.parents.findIndex(function(n) { return n.id == node.id; });
			if (asParentIndex != -1) {
				/// It was one of otherNode's parents, so need to remove and
				/// fix CPT/equation

				//if (otherNode.cpt && node.cpt) {

					/// This includes all the
					/*var nodeAndLaterCombos = numNodeStateCombinations(otherNode.parents.slice(asParentIndex));
					var laterCombos = numNodeStateCombinations(otherNode.parents.slice(asParentIndex+1));
					var earlierCombos = numNodeStateCombinations(otherNode.parents.slice(0, asParentIndex));
					var earlierAndNodeCombos = numNodeStateCombinations(otherNode.parents.slice(0, asParentIndex+1));
					//onsole.log(nodeAndLaterCombos, laterCombos, earlierCombos, earlierAndNodeCombos, otherNode.cpt);

					/// Collapse/marginalise CPT
					var newCpt = new Float32Array(new ArrayBuffer(earlierCombos*laterCombos*otherNode.states.length*4));
					for (var j1=0; j1<earlierCombos; j1++) {
						for (var k=0; k<node.states.length; k++) {
							for (var j2=0; j2<laterCombos; j2++) {
								oldRow = (j1 * nodeAndLaterCombos) + (k * laterCombos) + j2;
								newRow = (j1 * laterCombos) + j2;
								for (var i=0; i<otherNode.states.length; i++) {
									newCpt[newRow*otherNode.states.length + i] += otherNode.cpt[oldRow*otherNode.states.length + i];
								}
							}
						}
					}
					/// Normalise (actually, this may be slightly off due to rounding)
					for (var i=0; i<newCpt.length; i++) {
						newCpt[i] = newCpt[i]/node.states.length;
					}
					node.cpt = newCpt;*/
					//onsole.log(newCpt);

				//}

				/// Make copy of how node used to be
				/// (We need to pass in net for the lat
				var oldChild = otherNode.duplicateLocal();

				/// Remove
				otherNode.parents.splice(asParentIndex, 1);

				/// Fix up
				otherNode.def.updateChild({oldChild});
			}
		}

		/** Display is updated in display section below. **/

		this.net.needsCompile = true;
	},
	absorb: function() {
		this.delete({absorb: true});
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
};

function TextBox(o) {
	o = o || {};

	/// Defaults
	this.id = genPass(10);
	this.submodelPath = [];

	/// Visual properties
	DisplayItem.apply(this);
	this.pos = {x: 0, y: 0};

	this.text = '';

	/// Set options based on constructor args
	for (var i in o) {
		this[i] = o[i];
	}

	this.init(o);
	addDefaultSetters(this);
}
TextBox.prototype = {
	init: function(o) {
		o = o || {};

		if (this.net) {
			this.net.displayItems.push(this);
			
			if (o.addToCanvas) {
				this.net.display();
				this.net.updateAndDisplayBeliefs();
			}
		}
	}
};

function Submodel(o) {
	o = o || {};

	/// Defaults
	this.id = null;
	this.submodelPath = [];
	this.subNodes = [];
	this.submodelsById = {};
	this.comment = "";

	/// Visual properties
	DisplayItem.apply(this);
	/// For arc drawing/updating
	this.pathsIn = [];
	this.pathsOut = [];

	/// Set options based on constructor args
	Object.assign(this, o);
	
	/// XXX: Implement addToCanvas
	if (!o.__noinit && new.target)  this.init({addToCanvas: o.addToCanvas});
}
Submodel.prototype = {
	init: function(o) {
		o = o || {};
		
		if (this.net) {
			this.net.submodelsById[this.id] = this;
			
			if (!this.id) {
				var i = 0;
				while (this.net.submodelsById["submodel"+i]) i++;
				this.id = "submodel"+i;
			}
			
			if (o.addToCanvas) {
				this.net.display();
				this.net.updateAndDisplayBeliefs();
			}
		}

		if (!this.id) {
			this.id = genPass(10);
		}
	},
	/// XXX: Add check for valid id (and use a globally defined regexp for it)
	rename: function(newId) {
		var parent = this.net.getSubmodel(this.submodelPath);
		delete parent.submodelsById[this.id];
		this.id = newId;
		parent.submodelsById[newId] = this;
		/// Unfortunately, need to update all items referring to this one
		var allItems = this.getAllItems();
		for (var i=0; i<allItems.length; i++) {
			allItems[i].submodelPath[this.submodelPath.length] = newId;
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
		for (var i in this.net.displayItems) {
			/// Check if item belongs to this submodel (no shortcut for items, like there is for nodes)
			if (this.net.displayItems[i].submodelPath.join("/") == this.submodelPath.concat([this.id]).join("/")) {
				items.push(this.net.displayItems[i]);
			}
		}

		///submodels
		for (var i in this.submodelsById) {
			items.push(this.submodelsById[i]);
		}

		return items;
	},
	/**
	Get all the items (nodes, submodels, text, etc.) in this and any submodels.

	XXX Text needs to be implemented (for submodels in general)
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
		/// Remove from old submodel (if there)
		var oldSubmodel = this.net.getSubmodel(this.submodelPath);
		var submodel = this;
		delete oldSubmodel.submodelsById[submodel.id];

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
};

/// An index for naming new BNs
var __newBnIndex = 1;

/// A BN is also a submodel (of course...)
function BN(o) {
	o = o || {};
	/// This implements the 'submodel' interface ({id/node/submodels/pos/size})
	Submodel.apply(this);

	o.format = o.format || "xdsl";

	this.fileName = o.fileName || null;
	this.source = o.source;
	this.sourceFormat = o.format;
	this.outputEl = null;

	/// Use worker threads to do belief updating?
	this.useWorkers = useWorkers;
	this._workers = [];
	this.numWorkers = 2;

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
	this.displayItems = [];

	/// Various cached information
	this._utilityNodes = [];
	this._decisionNodes = [];
	this._rootNodes = [];
	this._nodeOrdering = [];

	/// Track changes to the BN
	this.changes = new UndoList();

	this.currentSubmodel = []; //["Orchard","Tree"];

	this.getRowIInts = new Int32Array(new ArrayBuffer(2*4));

	this._trackingArcInfluences = false;

	if (!o.__noinit && new.target)  this.init(o);
	addDefaultSetters(this);
}
BN.prototype = {
	init: function(o) {
		o = o || {};

		this.iterations = 1000;
		this.timeLimit = null;
		this.updateViewer = true;
		this.perfLoops = 100;
		this.perfIterations = 100000;
		
		this.fileName = this.fileName || "bn"+(__newBnIndex++)+".xdsl";

		if (this.source) {
			this["load_"+this.sourceFormat](this.source);
		}

		if (o.outputEl) {
			this.outputEl = $(o.outputEl);
			this.display();
		}
	},
	/// All load/save functions for different formats have the format 'load_<format>' or
	/// 'save_<format>'.
	load_xdsl: function(xdsl) {
		this.objs = $(xdsl);
		//console.log(this.objs);

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
		this.objs.find("> nodes cpt, > nodes deterministic, > nodes decision, > nodes utility, > nodes equation").each(function() {
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
			var textBox = new TextBox({
				net: bn,
				pos: {x: Number(posInfo[0]), y: Number(posInfo[1])},
				size: {width: Number(posInfo[2])-Number(posInfo[0]), height: Number(posInfo[3])-Number(posInfo[1])},
				submodelPath: submodelPars,
				/// The parse interprets the <caption> element in a unique way, converting it to a text node...
				text: this.childNodes[0].textContent,
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
			///Override with 10
			numSlices = 10;
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
		var comment = bnet._findObject({children: {0: "comment", 2: {children: {0: OBJECTVALUE}}}});
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
			var omNode = nodes[ni];
			var nodeId = omNode.children[1];
			var isTextNode = false;
			console.log(omNode);
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
			if (states) {
				states = states.replace(/[\(\)\s]/g, '')._splitNotEmpty(/,/);
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
				try {
					var cptStr = omNode._findObject({children: {0: "probs", 2: {children: {0: OBJECTVALUE}}}});
					//var cptStr = JSON.search(omNode, '//*[children[1]="probs"]/children[3]/children')[0];
					/// defiantjs converts all new lines to &#13;, presumably for xpath compatibility
					cptStr = cptStr.replace(/&#13;/g, '\n');
					/// Remove all comments
					cptStr = cptStr.replace(/\/\/.*/g, '');
					/// XXX Need to do more to support the various types of .dne 'probs' formats
					//onsole.log( cptStr );
					cpt = cptStr.replace(/[\(\)\s\n\r]|&[^&;]+;/g, '')._splitNotEmpty(/,/);
				}
				catch (e) {}
				var comment = null;
				try {
					//comment = JSON.search(omNode, '//*[children[1]="comment"]/children[3]/children')[0];
					comment = omNode._findObject({children: {0: "comment", 2: {children: {0: OBJECTVALUE}}}});
				}
				catch (e) {}
			}
			var label = null;
			try {
				//label = JSON.search(omNode, '//*[children[1]="title"]/children[3]/children')[0];
				label = omNode._findObject({children: {0: "title", 2: {children: {0: OBJECTVALUE}}}});
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
					size: {width: -1, height: 30},
				});
			}
			else {
				var def = new CPT(null, cpt);
				var node = new Node({
					net: this,
					id: nodeId,
					label: label,
					//parents: JSON.search(omNode, '//*[children[1]="parents"]/children[3]/children')[0].replace(/[\(\)\s]/g, '')._splitNotEmpty(/,/),
					parents: omNode._findObject({children: {0: "parents", 2: {children: {0: OBJECTVALUE}}}}).replace(/[\(\)\s]/g, '')._splitNotEmpty(/,/),
					states: states,
					def: def,
					pos: {x: Number(centerPos[0]), y: Number(centerPos[1])},
					size: {width: 80, height: 30},
					comment: comment,
				});
				/// Check for any empty CPTs, and set to a useful initial
				if (!cpt)  node.def.setInitial();
			}
		}
		console.timeEnd('searching');
		console.time('compiling');
		this.compile(true);
		console.timeEnd('compiling');

		/// Update node count, comments, etc. (if present)
		bn.updateViewer = true;
	},
	/** After basic loading, need to run various cleanups, replace named objects with object points,
		store things in more optimised form, etc.

		This is now basically a compile function. Update: Hence why it's now called 'compile'. :)
		**/
	compile: function(force) {
		if (!force && !this.needsCompile)  return;
		console.log('Compiling...');

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
			for (var j in node.parents) {
				if (typeof(node.parents[j])==="string") {
					console.log(node.parents, j, node.parents[j]);
					node.parents[j] = bn.nodesById[node.parents[j]];
					node.parents[j].children.push(node);
				}
			}
			node.statesById = {};
			for (var j in node.states) {
				node.statesById[node.states[j].id] = node.states[j];
			}
			console.log(node._name, node);
		}
		/// Set uniform CPTs for decision nodes
		/*for (var i in bn.nodes) {
			var node = bn.nodes[i];
			/// For some reason, I was checking for the asbence of node.cpt here
			/// But, I think, I just want to test if it's a decision node
			if (node.type == "decision") { // || !node.cpt) {
				var len = node.numParentCombinations()*node.states.length;
				var cpt = [];
				for (var j=0; j<len; j++) {
					cpt.push(1/node.states.length);
				}
				node.cpt = cpt;
			}
		}
		/// Replace ordinary CPT arrays with typed arrays
		for (var i in bn.nodes) {
			var node = bn.nodes[i];
			if (ArrayBuffer) {
				if (node.cpt) {
					var cptBuf = new ArrayBuffer(node.cpt.length*4);
					var newCpt = new Float32Array(cptBuf);
					for (var i=0; i<node.cpt.length; i++) {
						newCpt[i] = node.cpt[i];
					}
					node.cpt = newCpt;
				}
				else if (node.funcTable) {
					var ftBuf = new ArrayBuffer(node.funcTable.length*4);
					var newFt = new Int32Array(ftBuf);
					for (var i=0; i<node.funcTable.length; i++) {
						newFt[i] = node.funcTable[i];
					}
					node.funcTable = newFt;
				}
			}
		}*/

		this.updateRootNodes();
		this.updateNodeOrdering();

		if (this.useWorkers) {
			console.log('Using workers');
			/// XXX Redo the compile so that the worker-ready BN is built from scratch (to avoid
			/// hassles passing in data to the workers)
			/// Extract the key parts of the BN needed to do the inference
			var bnToPass = {};
			for (var k in bn) {
				if (typeof(bn[k])!="function") {
					bnToPass[k] = bn[k];
				}
			}
			/// Not sure about nulling out net and then restoring it after sent
			for (var i=0; i<bnToPass.nodes.length; i++) {
				bnToPass.nodes[i].net = null;
				//bnToPass.nodes[i].func = null;
				bnToPass.nodes[i].def.func = null;
				this.getSubmodel(bnToPass.nodes[i].submodelPath).net = null;
			}
			for (var i=0; i<bnToPass.displayItems.length; i++) {
				bnToPass.displayItems[i].net = null;
			}
			bnToPass.objs = null;
			bnToPass.outputEl = null;
			bnToPass._workers = null;
			bnToPass.submodelsById = null;
			bnToPass.subNodes = null;
			/// Ack! This caused me much pain
			bnToPass.net = null;
			bnToPass.changes = null;
			/// NOTE: If receive DataCloneError, use following to work out
			/// where the invalid object is lurking...
			/*var objsSeen = [];
			(function checkBn(obj, path){
				for (var k in obj) {
					path.push(k);
					//console.log(path);
					if (typeof(obj[k]) == "object" && objsSeen.findIndex(function(v) { return v==obj[k]})==-1) {
						objsSeen.push(obj[k]);
						checkBn(obj[k], path);
					}
					else {
						if (obj[k] instanceof jQuery || obj[k] instanceof HTMLElement) {
							console.log("Error: ", path);
						}
					}
					path.pop();
				}
			})(bnToPass, ["bnToPass"]);*/

			var numWorkers = this.numWorkers;

			/// Make the workers and store the BN just once
			if (this._workers.length != numWorkers) {
				this._workers = new Array(numWorkers);
			}
			for (var wi=0; wi<numWorkers; wi++) {
				if (!this._workers[wi])  this._workers[wi] = new Worker("_/js/beliefUpdate_worker.js");
				console.log("BNTOPASS:", bnToPass);
				this._workers[wi].postMessage([0, bnToPass]);
			}

			for (var i=0; i<bnToPass.nodes.length; i++) {
				bnToPass.nodes[i].net = this;
				this.getSubmodel(bnToPass.nodes[i].submodelPath).net = this;
			}
			for (var i=0; i<bnToPass.displayItems.length; i++) {
				bnToPass.displayItems[i].net = this;
			}
		}

		/* Compile the definitions (independently of whether workers are being used,
			just in case we don't use workers. */
		for (var node of bn.nodes) {
			if (node.def) {
				node.def.compile({force});
			}
		}

		this.needsCompile = false;
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
		var $smile = $("<smile version='1.0' id='sub0'>")
			/// XXX Clarify the difference btw numsamples/discsamples
			.attr("numsamples", this.iterations)
			.attr("discsamples", this.iterations);
		$smile.append("<nodes>");
		for (var i=0; i<this.nodes.length; i++) {
			var node = this.nodes[i];
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
		function formatColor(col) { return !col ? col : col.replace(/#/, ''); }
		/// If there are submodels, save them
		function makeSubmodel(submodel) {
			var $s = $('<submodel>').attr('id', submodel.id);
			$s
				.append($('<name>').text(submodel.label ? submodel.label : submodel.id))
				.append($("<position>").text(submodel.pos.x+" "+submodel.pos.y+" "+(submodel.pos.x+submodel.size.width)+" "+(submodel.pos.y+submodel.size.height)))
				/// GeNIe is awfully fussy (it requires format info, otherwise it breaks)
				.append($('<interior>').attr('color', formatColor(submodel.format.backgroundColor) || "e5f6f7"))
				.append($('<outline>').attr('color', formatColor(submodel.format.borderColor) || '0000bb'))
				.append($('<font>').attr('color', formatColor(submodel.format.fontColor) || '000000').attr('name', submodel.format.fontFamily || 'Arial').attr('size', submodel.format.fontSize || 8));
			for (var mySubmodel of Object.values(submodel.submodelsById)) {
				$s.append(makeSubmodel(mySubmodel));
			}
			return $s;
		}
		$smile.find('> extensions > genie').append( Object.values(this.submodelsById).map(s=>makeSubmodel(s)) );
		for (var i=0; i<this.nodes.length; i++) {
			var node = this.nodes[i];
			var $node = $("<node>").attr("id", node.id);
			$node
				.append($("<name>").text(node.label ? node.label : node.id))
				.append($("<position>").text(node.pos.x+" "+node.pos.y+" "+(node.pos.x+node.size.width)+" "+(node.pos.y+node.size.height)))
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
		if (this.displayItems.length) {
			for (var item of this.displayItems) {
				$('<textbox>').append(
					$('<caption>').text(item.text.trim()),
					$('<font>').attr({
						color: formatColor(item.format.fontColor) || '000000',
						name: item.format.fontFamily || 'Arial',
						size: item.format.fontSize || 8,
					}),
					$('<position>').text(item.pos.x+" "+item.pos.y+" "+(item.pos.x+item.size.width)+" "+(item.pos.y+item.size.height)),
				).appendTo($smile.find('> extensions > genie'));
			}
		}
		if (this.comment) {
			$('<comment>').text(this.comment).appendTo($smile.find('> extensions > genie'));
		}
		return vkbeautify.xml('<?xml version="1.0"?>' + $smile[0].outerHTML).replace(/\r?\n/g, '\r\n');
	},
	/**
	Add a new node to the network. net.addNode(...) is equivalent to |new Node(net, ...)|.
	*/
	addNode: function(id, states, opts) {
		opts = opts || {};
		console.log(opts);

		var newNode = new Node($.extend({
			net: this,
			id: id,
			states: states,
		}, opts));

		return newNode;
	},
	/**
	Add a submodel to the network. net.addSubmodel(...) is equivalent to |new Submodel(net, ...)|.
	*/
	addSubmodel: function(id, opts) {
		opts = opts || {};
		
		var newSubmodel = new Submodel(Object.assign({
			net: this,
			id: id
		}, opts));
		
		return newSubmodel;
	},
	addTextBox: function(text, opts) {
		opts = opts || {};
		
		var textBox = new TextBox(Object.assign({
			text: text,
			net: this,
		}, opts));
		
		return textBox;
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
		var displayItem = this.displayItems.find(i => i.id == id);
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
		var s = this;
		for (var i=0; i<submodelPath.length; i++) {
			s = s.submodelsById[submodelPath[i]];
		}
		return s;
	},
	setEvidence: function(evidence, o) {
		o = o || {};
		o.reset = o.reset || false;
		
		if (o.reset)  currentBn.evidence = {};
		Object.assign(currentBn.evidence, evidence);

		return this;
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
							var rowI = node.getCptRowI(parentStates);
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
	setUpdateMethod: function(method) {
		this.updateBeliefs = this["updateBeliefs_"+method];
	},
	/// This updates the expected value for the current network,
	/// given the current evidence.
	updateExpectedValue: function() {
		/// XXXXXX Calculating net's current expected value
		if (this._utilityNodes.length) {
			var totalUtility = 0;
			for (var i=0; i<this._utilityNodes.length; i++) {
				var uNode = this._utilityNodes[i];
				var ev = 0;
				for (var i in uNode.utilities) {
					ev += uNode.utilities[i]*uNode.beliefs[i];
				}
				totalUtility += ev;
			}
			this.expectedValue = totalUtility;
		}
	},
	/// FIX: I'm pretty sure this needs to be removed
	updateBeliefs: function(callback, iterations) {
		console.log('local');
		this.expectedValue = null;

		this.updateBeliefs_local(callback, iterations);
		this.updateExpectedValue();
	},
	/// Run a belief update, using worker threads to
	/// perform the computations in parallel
	updateBeliefs_worker: function(callback, iterations) {
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
					var workerBeliefs = e.data[1];
					var workerSamples = e.data[2];
					var iterationsRun = e.data[3];
					totalIterationsRun += iterationsRun;
					for (var i=0; i<workerBeliefs.length; i++) {
						//console.log(workerBeliefs, workerSamples);
						console.log(bn.nodes[i].beliefs, bn.nodes[i].samples);
						if (numComplete==1) {
							bn.nodes[i].beliefs = workerBeliefs[i];
							bn.nodes[i].samples = workerSamples[i];
						}
						else {
							var allBeliefs = bn.nodes[i].beliefs;
							//var allSamples = Array.prototype.slice.call(bn.nodes[i].samples);
							for (var bi=0; bi<allBeliefs.length; bi++) {
								allBeliefs[bi] += workerBeliefs[i][bi];
								if (numComplete == numWorkers) {
									allBeliefs[bi] /= numComplete;
								}
							}
							console.log(workerSamples[i]);
							bn.nodes[i].beliefs = allBeliefs;
							bn.nodes[i].samples = new Float32Array([].concat.call(
								[].slice.call(bn.nodes[i].samples),
								[].slice.call(workerSamples[i])
							));
							if (bn.nodes[i].def.type == 'Equation' && numComplete == numWorkers) {
								bn.nodes[i].discretizeFromSamples();
							}
						}
					}
					if (numComplete == numWorkers) {
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
	updateBeliefs_local: function(callback, iterations) {
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
				node.discretizeFromSamples();
			}
			else {
				for (var j=0; j<node.beliefs.length; j++) {
					if (node.seen>0)  node.beliefs[j] = node.counts[j]/node.seen;
				}
			}
		}

		if (callback)  callback(bn);
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
	searchDecisionsAll: function() {
		var decStates = initialStates(this._decisionNodes);
		var origEvidence = $.extend({}, this.evidence);
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
			this.updateBeliefs_local(null, iterations);
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
	/// XXX: This is not done right. (Should be OK for dec nodes, but not anything else.) Need to fix.
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
	searchDecisionsOrdered: function() {
		var decNodes = this.topologicalSort(this._decisionNodes);
		var decStates = [];
		var origEvidence = $.extend({}, this.evidence);
		var iterations = 10000;
		for (var i=0; i<decNodes.length; i++) {
			var maxJ = -1;
			var maxEv = -1;
			for (var j=0; j<decNodes[i].states.length; j++) {
				this.evidence[decNodes[i].id] = j;
				this.updateBeliefs_local(null, iterations);
				this.updateExpectedValue();
				if (this.expectedValue > maxEv) {
					maxEv = this.expectedValue;
					maxJ = j;
				}
			}
			decStates[i] = maxJ;
			this.evidence[decNodes[i].id] = maxJ;
		}
		this.updateBeliefs_local(null, iterations);
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
	removeTrackArcInfluences: function() {
		var nodesToRemove = [];
		for (var i=0; i<this.nodes.length; i++) {
			if (this.nodes[i].id.search(/^__mutualInfo_/)!=-1) {
				nodesToRemove.push(this.nodes[i]);
			}
		}
		for (var i=0; i<nodesToRemove.length; i++) {
			var node = nodesToRemove[i];
			node.delete();
		}
		/// Reset all arcs to width 1
		$('.dependency').css('stroke-width', '1px');

		this._trackingArcInfluences = false;
	},
	displayArcsWithInfluences: function() {
		var sumMis = {};
		var sumChildEntropies = {};
		for (var i=0; i<this.nodes.length; i++) {
			var node = this.nodes[i];
			if (node.engineOnly)  continue;
			for (var j=0; j<node.children.length; j++) {
				var child = node.children[j];
				if (child.engineOnly)  continue;

				/// The very objects themselves should be the same, but test by id anyway,
				/// in case some transformation happens (in a future version).
				var miNode = node.children[node.children.findIndex(function(v) { return v.id.search(/^__mutualInfo_/)!=-1 && v.parents[0].id==node.id && v.parents[1].id==child.id; })];
				console.log(miNode);
				var childEntropy = 0;
				for (var k=0; k<child.states.length; k++) {
					childEntropy += -(child.beliefs[k] * Math.log(child.beliefs[k]));
				}
				var mi = 0;
				for (var k=0; k<miNode.states.length; k++) {
					var Pxy = miNode.beliefs[k];
					var Px = node.beliefs[Math.floor(k/child.states.length)];
					var Py = child.beliefs[k % child.states.length];
					console.log(Pxy, Px, Py);

					if (Pxy==0 || Px==0 || Py==0)  continue;

					var pMi = Pxy * Math.log(Pxy/(Px*Py));
					mi += pMi;
				}
				console.log("MI:", mi, "Entropy of child:", childEntropy);

				/// Find the item (either node or submodel) that is visible in
				/// the current submodel and corresponds to the current child --- if there is one
				var item = child;
				do {
					if (item.isVisible())  break;

					item = this.net.getSubmodel(item.submodelPath);
				} while (item.submodelPath.length > 0);

				/// Update the arc with representation of the MI influence
				/// Find the right arc
				var arcInfo = node.pathsOut[node.pathsOut.findIndex(function(p) { return p.childItem.id == item.id })];
				/// If we can't find arcInfo, it's
				if (arcInfo) {
					var arc = $("#"+arcInfo.pathId);
					if (!(arcInfo.pathId in sumMis)) {
						sumMis[arcInfo.pathId] = 0;
						sumChildEntropies[arcInfo.pathId] = 0;
					}
					/// Update arc width based on MI influence
					var entropyProportion = 0;
					sumMis[arcInfo.pathId] += mi;
					sumChildEntropies[arcInfo.pathId] += childEntropy;
					if (sumChildEntropies[arcInfo.pathId] > 0) {
						entropyProportion = sumMis[arcInfo.pathId]/sumChildEntropies[arcInfo.pathId];
					}
					var minVal = 0.01;
					if (entropyProportion > minVal) {
						//console.log("stroke", (entropyProportion*10)+"px");
						arc.css('stroke-width', (entropyProportion*10)+"px");
					}
					else {
						//console.log("minStroke", (entropyProportion*10)+"px");
						arc.css('stroke-width', minVal+"px");
					}
				}
			}
		}
	},
	/// Don't use this function
	showArcInfluences: function() {
		var bn = this;
		this.trackArcInfluences();
		this.updateBeliefs(function() {
			bn.displayArcsWithInfluences();
			/// FIX: Remove arc influences
		});
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
	/** Performance testing functions
		These all start with the prefix 'perf'. They should probably
		be broken out into their own file.
		FIX: break out into on file.
	**/
	perfTest: function() {
		console.profile("Starting...");
		this.updateBeliefs_local(null, 1000);
		console.profileEnd("Stopped.");
		console.debug(this.nodes);
	},
	perfCheck: function() {
		console.log('perf check');
		var t, dt, st = 0;
		for (var i=0; i<this.perfLoops; i++) {
			t = performance.now();
			this.updateBeliefs_local(null, this.perfIterations);
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
			currentBn.evidence[nodes[i].id] = state;
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
	findAllDConnectedNodes2: function(sourceNode) {
		var bn = this;
		if (typeof(sourceNode)=="string")  sourceNode = this.nodesById[sourceNode];

		var upVisited = {};
		var downVisited = {};
		var toUpVisit = [sourceNode];
		var toDownVisit = [sourceNode];
		var connectedNodes = {};

		while (toUpVisit.length || toDownVisit.length) {
			while (toUpVisit.length) {
				var nextNode = toUpVisit.shift();
				//onsole.log("toUpVisit:", nextNode);
				if (!upVisited[nextNode.id]) {
					upVisited[nextNode.id] = true;
					/// If this node has no evidence, can go both up and down
					/// Otherwise, can't go up or down any further
					if (!(nextNode.id in this.evidence)) {
						connectedNodes[nextNode.id] = true;
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
			}
			while (toDownVisit.length) {
				var nextNode = toDownVisit.shift();
				//onsole.log("toDownVisit:", nextNode);
				if (!downVisited[nextNode.id]) {
					downVisited[nextNode.id] = true;
					/// If this node has no evidence, then can go down, but not up
					/// Otherwise, can go up, but not down
					if (!(nextNode.id in this.evidence)) {
						connectedNodes[nextNode.id] = true;
						for (var i=0; i<nextNode.children.length; i++) {
							var child = nextNode.children[i];
							toDownVisit.push(child);
						}
					}
					else {
						for (var i=0; i<nextNode.parents.length; i++) {
							var parent = nextNode.parents[i];
							toUpVisit.push(parent);
						}
					}
				}
			}
		}

		var ret = [];
		for (var nodeId in connectedNodes) {
			ret.push(this.nodesById[nodeId]);
		}

		return ret;
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
};
addDefaultSetters(BN);
addDefaultSetters(Node);
addDefaultSetters(State);

if (typeof(exports)!="undefined") {
	exports.BN = BN;
	exports.Node = Node;
	exports.Submodel = Submodel;
}