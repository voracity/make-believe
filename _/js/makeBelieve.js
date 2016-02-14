var titlePostfix = "Make-Believe (R21)";
var openBns = [];
var openData = [];
var currentBn = null;

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
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/&/g, '&amp;');
	return str;
}

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

window.qs = getQs();

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

function fileLoaded(inp, callback) {
	var fileExts = {xdsl:true,dne:true};
	var file = inp.files[0];

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
		openBns.push(new BN({source: e.target.result, outputEl: $(".bnview"), format: format}));
		currentBn = openBns[openBns.length-1];
		currentBn.fileName = fileName;
		$(".status").text(currentBn.nodes.length+" nodes");
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
		openBns.push(new BN({source: data, outputEl: $(".bnview"), format: format}));
		currentBn = openBns[openBns.length-1];
		currentBn.fileName = baseName(fileName);
		document.title = baseName(fileName) + " - " + titlePostfix;
		$(".status").text(currentBn.nodes.length+" nodes");
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
	var whatsDirty = {};
	popupDialog($content, {
		className: 'contextMenu '+opts.className,
		buttons: [
			$('<button type=button class=saveButton disabled>').html('Save').on('click', function() {
				$(".dialog .saveButton")[0].disabled = true;
				console.log(whatsDirty);
				var controls = opts.controls;
				for (var control in controls) {
					if (whatsDirty[control]) {
						whatsDirty[control] = false;
						if ($('.dialog *[data-control='+control+']').is('input, select, textarea')) {
							if ($('.dialog *[data-control='+control+']').is(':valid')) {
								var $control = $('.dialog *[data-control='+control+']');
								var val = $control.val();
								/// false means change didn't save
								if (!controls[control].change(val, $control)) {
									$(".dialog .saveButton")[0].disabled = false;
									whatsDirty[control] = true;
								}
							}
						}
						else {
							/// Non-standard control, just call with no arguments

							/// false means change didn't save
							if (!controls[control].change($('.dialog *[data-control='+control+']'))) {
								$(".dialog .saveButton")[0].disabled = false;
								whatsDirty[control] = true;
							}
						}
					}
				}
			}),
			$('<button type=button class=closeButton>').html('Close').on('click', dismissDialogs),
		],
	});
	$(".dialog").on("change keyup", function(event) {
		if ($(event.target).closest('*[data-control]').length) {
			var name = $(event.target).closest('*[data-control]').data('control');
			whatsDirty[name] = true;
		}
		$(".dialog .saveButton")[0].disabled = false;
	});
}
/** End Dialogs **/

function State(o) {
	/// The state's ID (as per GeNIe)
	this.id = null;
	/// The state's index in the node state list
	this.index = null;

	/// Set options based on constructor args
	for (var i in o) {
		this[i] = o[i];
	}
}

/** To create a node, call new Node({opt1:...,opt2:...}) **/
function Node(o) {
	/*
		Member vars and their defaults
	*/
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
	/// The CPT, preferably as a typed float array (only if discrete probabilistic)
	this.cpt = null;
	/// The deterministic function table (only if discrete deterministic)
	this.funcTable = null;
	/// The text of the function for this node
	this.funcText = null;
	/// The function for this node (which can be any javascript function that returns a real value)
	this.func = null;
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
	this.pos = {x: 0, y: 0};
	this.size = {width: 0, height: 0};
	/// Formatting (all at their defaults)
	this.format = {
		backgroundColor: null,
		borderColor: null,
		fontColor: null,
		fontFamily: null,
		fontSize: null,
	};
	/// For arc drawing/updating
	this.pathsIn = [];
	this.pathsOut = [];

	/// Set options based on constructor args
	for (var i in o) {
		this[i] = o[i];
	}

	this.init({addToCanvas: o.addToCanvas});
}
/// Use this if the node hasn't been set up yet. Otherwise,
/// just this.parseEquation with equationText.
Node.parseEquation = function(nodeId, parentIds, equationText) {
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
/**
'engineOnly' means node is only visible to the engine, not in the interface
**/
Node.makeNodeFromXdslEl = function (el, $xdsl, opts) {
	opts = opts || {};
	opts.engineOnly = opts.engineOnly || false;

	var $el = $(el);
	var states = $el.find("state").toArray().map(function(a,i){ return new State({id:$(a).attr("id"), index: i}); });
	var stateIndex = {}; states.forEach(function(a,i) { stateIndex[a.id] = i; });
	var cpt = null;
	var funcTable = null;
	var func = null;
	var funcDef = null;
	var funcText = null;
	var utils = null;

	if ($el.is("cpt")) {
		cpt = $el.find("probabilities").text()._splitNotEmpty(/\s+/).map(function(p){return parseFloat(p)});
	}
	else if ($el.is("deterministic")) {
		var map = $el.find("resultingstates").text()._splitNotEmpty(/\s+/);
		funcTable = [];
		for (var i in map) {
			funcTable.push( stateIndex[map[i]] );
		}
		/*/// Go through and convert/expand each row from single-deterministic value to probabilities
		cpt = [];
		for (var i in map) {
			var toState = stateIndex[map[i]];
			console.log("toState:", toState);
			for (var j=0; j<states.length; j++) {
				cpt.push(toState==j ? 1 : 0);
			}
		}
		console.log(cpt);*/
	}
	else if ($el.is("equation")) {
		var parentIds = $el.find("parents").text().split(/\s+/);
		funcText = $el.find("definition").text();
		funcDef = Node.parseEquation($el.attr('id'), parentIds, funcText);
		//func = new Function(funcDef[0], funcDef[1]);
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
		cpt: cpt,
		funcTable: funcTable,
		func: func,
		funcDef: funcDef,
		funcText: funcText,
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

		node._updateDisplay = !node.engineOnly;

		/// Convert states, if needed
		if (node.states.length && typeof(node.states[0])=="string") {
			var statesById = {};
			var stateObjects = [];
			for (var i=0; i<node.states.length; i++) {
				stateObjects.push({id: node.states[i], index: i});
				statesById[node.states[i]] = i;
			}
			node.states = stateObjects;
			node.statesById = statesById;
		}

		/// Make the CPTs and function tables typed
		if (node.cpt) {
			node.cpt = new Float32Array(node.cpt);
		}
		else if (node.funcTable) {
			node.funcTable = new Int32Array(node.funcTable);
		}

		/// Setup the vectors needed for the inference (needed even if using workers)
		node.beliefs = new Float32Array(new ArrayBuffer(node.states.length*4));
		node.counts = new Float32Array(new ArrayBuffer(node.states.length*4));
		node.parentStates = new Float32Array(new ArrayBuffer(node.parents.length*4));

		/// Notify submodel
		this.moveToSubmodel(this.submodelPath);

		var bn = this.net;

		/// Add to children in parents
		for (var i=0; i<node.parents.length; i++) {
			var parent = node.parents[i];
			/// If we're in the middle of loading from a file, parent may
			/// just be a string still. It will get compiled properly later.
			if (typeof(parent)=="object") {
				parent.children.push(node);
			}
		}

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

		if (o.addToCanvas) {
			bn.display();
			bn.updateAndDisplayBeliefs();
		}
	},
	numParentCombinations: function() {
		var numParentStates = 1;
		for (var j=0; j<this.parents.length; j++) {
			numParentStates *= this.parents[j].states.length;
		}
		return numParentStates;
	},
	getRow: function(i) {
		return Array.prototype.slice.call(this.cpt, i*this.states.length, i*this.states.length+this.states.length);
	},
	getCptRowI: function(parentStates) {
		var rowI = 0;
		var multiplier = 1;
		var parentState = -1;
		for (var pi=this.parents.length-1; pi>=0; pi--) {
			parentState = parentStates[pi];
			if (typeof(parentState)=="string")  parentState = this.parents[pi].statesById[parentState].index;
			rowI += multiplier*parentState;
			multiplier *= this.parents[pi].states.length;
		}
		return rowI;
	},
	addStates: function(newStates, opts) {
		opts = opts || {};
		var insertPoint = opts.at != undefined ? opts.at : this.states.length;

		var numStates = this.states.length;
		var numNewStates = numStates + newStates.length;

		for (var i=0; i<newStates.length; i++) {
			var stateName = newStates[i];
			this.states.splice(insertPoint, 0, new State({id: stateName, index: i}));
			this.statesById[stateName] = this.states[insertPoint];
		}
		/// And now let's update all the indices...
		for (var i=0; i<this.states.length; i++)  this.states[i].index = i;

		/// Update the CPT
		var rows = this.cpt.length/numStates;
		var newCpt = new Float32Array(new ArrayBuffer(rows*numNewStates*4));
		for (var r=0; r<rows; r++) {
			for (var i=0; i<insertPoint; i++) {
				newCpt[r*numNewStates + i] = this.cpt[r*numStates + i];
			}
			/*
			Float arrays are 0 initialised by default
			for (var i=numStates; i<numNewStates; i++) {
				newCpt[r*numNewStates + i] = 0;
			}*/
			for (var i=insertPoint+newStates.length; i<numNewStates; i++) {
				newCpt[r*numNewStates + i] = this.cpt[r*numStates + (i-newStates.length)];
			}
		}
		this.cpt = newCpt;

		/// Update the state-dependent inf states
		//this.beliefs = new Float32Array(new ArrayBuffer(this.states.length*4));
		//this.counts = new Float32Array(new ArrayBuffer(this.states.length*4));

		this.net.needsCompile = true;
	},
	/// statesToRemove=* -> remove all, statesToRemove = [1,2,"gary"] -> remove states
	/// with the given name or index
	removeStates: function(statesToRemove, opts) {
		opts = opts || {};

		if (statesToRemove === "*") {
			this.states = [];
			this.statesById = {};
			this.cpt = new Float32Array([]);
		}
		else {
			var numStates = this.states.length;
			var numNewStates = this.states.length - statesToRemove.length;

			/// Convert all state refs to indexes (and delete states from list
			/// while we're at it)
			for (var i=statesToRemove.length-1; i>=0; i--) {
				if (typeof(statesToRemove[i])=="string") {
					statesToRemove[i] = this.statesById[statesToRemove[i]].index;
				}
				var delState = this.states.splice(statesToRemove[i], 1)[0];
				delete this.statesById[delState.id];
			}

			statesToRemove.sort(function(a,b){ return a-b; });

			var rows = this.cpt.length/numStates;
			var newCpt = new Float32Array(new ArrayBuffer(rows*numNewStates*4));
			var adjust = 0;
			for (var r=0; r<rows; r++) {
				for (var i=0; i<numNewStates; i++) {
					while ((i+adjust)===statesToRemove[adjust]) {
						adjust++;
					}
					newCpt[r*numNewStates + i] = this.cpt[r*numStates + (i + adjust)];
				}
			}
			this.cpt = newCpt;
		}

		this.net.needsCompile = true;
	},
	/// |renames| is an object that can take either state indexes or
	/// (previous) IDs as keys, and the new IDs as values
	renameStates: function(renames) {
		for (var oldId in renames) {
			var newId = renames[oldId];
			if (!isNaN(oldId)) {
				oldId = this.states[oldId].id;
			}
			if (oldId != newId) {
				this.statesById[newId] = this.statesById[oldId];
				this.statesById[newId].id = newId;
				delete this.statesById[oldId];
			}
		}
	},
	rename: function(newId) {
		delete this.net.nodesById[this.id];
		this.id = newId;
		this.net.nodesById[newId] = this;
	},
	parseEquation: function(equationText) {
		return Node.parseEquation(this.id, this.parents.map(function(p) { return p.id }), equationText);
	},
	equation: function(equationText) {
		if (equationText === undefined)  return this.funcText;

		var funcDef = this.parseEquation(equationText);
		this.funcText = equationText;
		this.funcDef = funcDef;
		this.func = null;
		this.net.needsCompile = true;
	},
	path: function(path) {
		if (path === undefined) {
			return ("/" + this.submodelPath.join("/") + "/").replace(/\/\//, '/');
		}

		/// XXX Improve validation of the path
		if (path.search(/^\//)!==-1) {
			this.moveToSubmodel(path.replace(/\/$/,'').split(/\//).slice(1));
		}

		return this;
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

		/// Save new path
		this.submodelPath = path.slice();

		/// Move node to new submodel
		this.net.getSubmodel(this.submodelPath).subNodes.push(this);
	},
	/// Create a duplicate node in the same network
	duplicateNode: function(id, extraProps) {
		var nodeProps = {};
		//var propsToDuplicate = {net:1,label:1,parents:1,cpt:1,func:1,funcDef:1,funcText:1,utilities:1,dbnOrder:1,dynamic:1,engineOnly:1,comment:1,format:1,funcTable:1,type:1};
		var propsToDuplicate = {parents:1,cpt:1};
		for (var i in this) {
			if (i == "parents" || i == "cpt") {
				nodeProps[i] = this[i];
			}
		}
		if (extraProps) {
			for (var i in extraProps) {
				nodeProps[i] = extraProps[i];
			}
		}
		return this.net.addNode(id, this.states.map(function(s){ return s.id }), nodeProps);
	},
	/// Delete this node from its network
	delete: function() {
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

			/// Parents need special treatment, because it affects CPT
			var asParentIndex = otherNode.parents.findIndex(function(n) { return n.id == node.id; });
			if (asParentIndex != -1) {
				/// It was one of otherNode's parents, so need to remove and
				/// fix CPT/equation


				if (otherNode.cpt && node.cpt) {
					/// This includes all the
					var nodeAndLaterCombos = numNodeStateCombinations(otherNode.parents.slice(asParentIndex));
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
					node.cpt = newCpt;
					//onsole.log(newCpt);

				}
				/// Remove
				otherNode.parents.splice(asParentIndex, 1);

			}
		}

		/** Display is updated in display section below. **/

		this.net.needsCompile = true;
	},
	discretizeFromSamples: function() {
		var node = this;
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
			node.removeStates();
			node.addStates(labels);
			node.beliefs = beliefs;
		}
		else {
			var discInfo = generateMultinomialFromSamples(node.samples, maxStates);
			node.removeStates();
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
	/// Need to avoid clashes with property names
	cpt1d: function(newCpt) {
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
			this.net.needsCompile = true;
		}
	},
};

function Submodel(o) {
	o = o || {};

	/// Defaults
	this.id = null;
	this.submodelPath = [];
	this.subNodes = [];
	this.submodelsById = {};

	/// Visual properties
	this.pos = {x: 0, y: 0};
	this.size = {width: 0, height: 0};
	/// For arc drawing/updating
	this.pathsIn = [];
	this.pathsOut = [];

	/// Set options based on constructor args
	for (var i in o) {
		this[i] = o[i];
	}
}
Submodel.prototype = {
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
	},
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
	getAllItems: function() {
		var submodelsToVisit = [this];
		var items = [];
		while (submodelsToVisit.length) {
			items = items.concat(submodelsToVisit[0].subNodes);
			for (var i in submodelsToVisit[0].submodelsById) {
				items.push(submodelsToVisit[0].submodelsById[i]);
				submodelsToVisit.push(submodelsToVisit[0].submodelsById[i]);
			}
			submodelsToVisit.shift();
		}
		return items;
	},
	path: Node.prototype.path,
	/// Move this node to the given submodel. |path| is a left-to-right array
	/// representing the path.
	moveToSubmodel: function(path) {
		console.log("path:", path);
		/// Remove from old submodel (if there)
		var oldSubmodel = this.net.getSubmodel(this.submodelPath);
		var submodel = this;
		delete oldSubmodel.submodelsById[submodel.id];

		/// Save old path
		var oldPath = this.submodelPath.slice();

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

/// A BN is also a submodel (of course...)
function BN(o) {
	o = o || {};
	/// This implements the 'submodel' interface ({id/node/submodels/pos/size})
	Submodel.apply(this);

	o.format = o.format || "xdsl";

	this.source = o.source;
	this.sourceFormat = o.format;
	this.outputEl = $(o.outputEl);

	/// Use worker threads to do belief updating?
	this.useWorkers = true;
	this._workers = [];
	this.numWorkers = 2;

	this.evidence = {};

	/// Does the cache information need updating?
	this.needsCompile = false;
	/// (To update the net, call the modification functions
	/// (once they're all written!) or change this.objs and then set this.needsCompile.)
	this.nodes = [];
	this.nodesById = {};

	/// Various cached information
	this._utilityNodes = [];
	this._decisionNodes = [];
	this._rootNodes = [];
	this._nodeOrdering = [];

	this.currentSubmodel = []; //["Orchard","Tree"];

	this.getRowIInts = new Int32Array(new ArrayBuffer(2*4));

	this._trackingArcInfluences = false;

	this.init();
}
BN.prototype = {
	init: function() {
		this.iterations = 1000;

		this["load_"+this.sourceFormat](this.source);
		this.display();
	},
	/// All load/save functions for different formats have the format 'load_<format>' or
	/// 'save_<format>'.
	load_xdsl: function(xdsl) {
		this.objs = $(xdsl);

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

			var posInfo = $(this).find("position").text().split(/\s+/);
			parSubmodel.submodelsById[$(this).attr("id")] = new Submodel({
				id: $(this).attr("id"),
				submodelPath: submodelPars,
				net: bn,
				subNodes: [],
				submodelsById: {},
				pos: {x: Number(posInfo[0]), y: Number(posInfo[1])},
				size: {width: Number(posInfo[2])-Number(posInfo[0]), height: Number(posInfo[3])-Number(posInfo[1])},
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
			var nodesInSlice = [];
			numSlices = $dyn.attr("numslices");
			///Override with 10
			numSlices = 10;
			var sliceNum = 1;

			for (; sliceNum<numSlices; sliceNum++) {
				function updateParentNames(node) {
					for (var pi=0; pi<node.parents.length; pi++) {
						var parentName = node.parents[pi];
						var parentSlice = sliceNum-node.dbnOrder;
						if (parentSlice!=0) {
							node.parents[pi] = parentName +"_"+(sliceNum-node.dbnOrder);
						}
					}
				}

				bn.objs.find("> nodes cpt, > nodes deterministic, > nodes decision, > nodes utility").each(function() {
					var node = Node.makeNodeFromXdslEl(this, bn.objs, {engineOnly:true, net: bn});
					node.id = node.id +"_"+ sliceNum;
					node.slice = sliceNum;
					//bn.nodes.push(node);
					//bn.nodesById[node.id] = node;
					updateParentNames(node);
					//onsole.debug(bn.nodes);
				});

				$dyn.find("> cpt, > deterministic, > nodes decision, > nodes utility").each(function() {
					var tempNode = Node.makeNodeFromXdslEl(this, bn.objs, {engineOnly:true, net: bn});
					tempNode.id = tempNode.id+"_"+sliceNum;
					var node = bn.nodesById[tempNode.id];

					/// If we've seen enough slices to accommodate the node's DBN order,
					/// start including the node in network
					if (sliceNum >= tempNode.dbnOrder) {
						/// Merge in parents for this slice
						updateParentNames(tempNode);
						if (tempNode.parents)  node.parents = node.parents.concat(tempNode.parents);
						/// Use the cpt for this slice
						node.cpt = tempNode.cpt;
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

		this.compile(true);
	},
	load_dne: function(dneText) {
		var bn = this;
		var grammar = new Grammar($('.dneGrammar')[0].textContent);
		//onsole.log(dneText);
		window.globalDneText = dneText;
		var om = grammar.createTree(dneText);
		console.log(om);
		var bnet = JSON.search(om, '//*[type="BLOCK_STATEMENT"][children[1]="bnet"]')[0];
		console.log(bnet);
		var nodes = JSON.search(bnet, '//*[type="BLOCK_STATEMENT"][children[1]="node"]');
		for (var ni=0; ni<nodes.length; ni++) {
			var omNode = nodes[ni];
			//onsole.log(omNode);
			/// ASSUME represents a text node?
			var skipNode = false;
			try {
				skipNode = JSON.search(omNode, '//*[children[1]="kind"]/children[3]/children')[0]=="ASSUME";
			}
			catch (e) { skipNode = true; }
			if (skipNode)  continue;
			var centerPos = JSON.search(omNode, '//*[children[1]="center"]/children[3]/children')[0].replace(/[\(\)\s]/g, '')._splitNotEmpty(/,/);
			var states = JSON.search(omNode, '//*[children[1]="states"]/children[3]/children')[0].replace(/[\(\)\s]/g, '')._splitNotEmpty(/,/);
			states = states.map(function(x,i){ return new State({id: x, index: i}) });
			var cpt = null;
			try {
				var cptStr = JSON.search(omNode, '//*[children[1]="probs"]/children[3]/children')[0];
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
				comment = JSON.search(omNode, '//*[children[1]="comment"]/children[3]/children')[0];
			}
			catch (e) {}
			var label = null;
			try {
				label = JSON.search(omNode, '//*[children[1]="title"]/children[3]/children')[0];
			}
			catch (e) {}
			console.log("CPT:", cpt);
			var node = new Node({
				net: this,
				id: omNode.children[1],
				label: label,
				parents: JSON.search(omNode, '//*[children[1]="parents"]/children[3]/children')[0].replace(/[\(\)\s]/g, '')._splitNotEmpty(/,/),
				states: states,
				cpt: cpt,
				pos: {x: Number(centerPos[0]), y: Number(centerPos[1])},
				size: {width: 80, height: 30},
				comment: comment,
			});
			//node.moveToSubmodel([]);
			//bn.nodes.push(node);
			//bn.nodesById[node.id] = node;
			//onsole.log(node);
		}
		this.compile(true);
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
		for (var i in bn.nodes) {
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
		}

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
				bnToPass.nodes[i].func = null;
				this.getSubmodel(bnToPass.nodes[i].submodelPath).net = null;
			}
			bnToPass.objs = null;
			bnToPass.outputEl = null;
			bnToPass._workers = null;
			bnToPass.submodelsById = null;
			bnToPass.subNodes = null;
			/// Ack! This caused me much pain
			bnToPass.net = null;
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
				if (node.cpt) {
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
						$("<probabilities>").text(Array.prototype.slice.call(node.cpt).join(" "))
					);
					})();
				}
				else if (node.funcTable) {
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
						$("<resultingstates>").text(Array.prototype.slice.call(node.funcTable).map(function(s){return node.states[s].id;}).join(" "))
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
					$("<utilities>").text(Array.prototype.slice.call(node.funcTable).map(function(s){return node.states[s].id;}).join(" "))
				);
				})();
			}
		}
		$smile.append(
			'<extensions><genie version="1.0" app="GeNIe 2.0.5219.0" name="Sub0" faultnameformat="nodestate"></genie></extensions>'
		);
		function formatColor(col) { return !col ? col : col.replace(/#/, ''); }
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
			$smile.find("> extensions > genie").append($node);
		}
		return vkbeautify.xml('<?xml version="1.0"?>' + $smile[0].outerHTML).replace(/\r?\n/g, '\r\n');
	},
	addNode: function(id, states, opts) {
		opts = opts || {};

		var newNode = new Node($.extend({
			net: this,
			id: id,
			states: states,
		}, opts));

		return newNode;
	},
	/// I now have this slight problem that Item -> {Node, Submodel},
	/// when previously I just had Node
	getItemById: function(id) {
		if (id in this.nodesById)  return this.nodesById[id];

		var toVisit = [this];
		while (toVisit.length) {
			var submodel = toVisit.shift();

			if (id in submodel.submodelsById)  return submodel.submodelsById[id];

			for (var submodelId in submodel.submodelsById)  toVisit.push(submodel.submodelsById[submodelId]);
		}
	},
	getSubmodel: function(submodelPath) {
		var s = this;
		for (var i=0; i<submodelPath.length; i++) {
			s = s.submodelsById[submodelPath[i]];
		}
		return s;
	},
	/// Lot's of limitations: discrete, no auto-discretize, etc.
	/// XXX: I've just written this without testing it yet!
	learnParametersCounting: function(data) {
		/// Start fresh (everything has a count of 1)
		for (var node of this.nodes) {
			node.cptCounts = new Int32Array(new ArrayBuffer(4*node.cpt.length));
			for (var i=0; i<node.cptCounts.length; i++)  node.cptCounts[i] = 1;
		}
		/// Run through data, counting parent combos + child values
		//var i = 0;
		for (var row of data) {
			//console.log(i); i++;
			for (var node of this.nodes) {
				var parentStates = new Array(node.parents.length);
				var missing = !(node.id in row) || row[node.id]==='*';
				if (!missing) {
					for (var ent of node.parents.entries()) { var pi=ent[0],parent=ent[1];
						if (parent.id in row && row[parent.id]!=='*') {
							parentStates[pi] = row[parent.id];
						}
						else {
							missing = true; break;
						}
					}
				}
				/// Skip if missing
				if (!missing) {
					var rowI = node.getCptRowI(parentStates);
					//console.log(parentStates, rowI, node.statesById[row[node.id]].index);
					node.cptCounts[rowI*node.states.length + node.statesById[row[node.id]].index] += 1;
				}
			}
		}
		/// Run through counts, normalize, and update CPTs
		for (var node of this.nodes) {
			/// Step through each row
			for (var i=0; i<node.cptCounts.length; i += node.states.length) {
				var normalized = normalize(Array.prototype.slice.call(node.cptCounts, i, i+node.states.length));
				for (var ent of normalized.entries()) { var vi=ent[0],v=ent[1];
					node.cpt[i+vi] = v;
				}
			}
		}
		this.needsCompile = true;
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
			currentBn.expectedValue = totalUtility;
		}
	},
	/// FIX: I'm pretty sure this needs to be removed
	updateBeliefs: function(callback, iterations) {
		currentBn.expectedValue = null;

		this.updateBeliefs_local(callback, iterations);
		this.updateExpectedValue();
	},
	updateBeliefs_worker: function(callback, iterations) {
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
		for (var i in this.evidence)  evidenceArr[bn.nodesById[i].intId] = Number(this.evidence[i]);

		/**
		This used to be used for debugging, to make sure bnToPass worked the same
		with local updating. Not sure if needed now since local updating uses the
		exact same function as the worker now.
		if (false) {
			updateBeliefs_local(bnToPass, evidenceArr);
			if (callback)  callback(bn);
		}*/
		var numComplete = 0;
		for (var wi=0; wi<numWorkers; wi++) {
			var w = this._workers[wi];
			w.postMessage([1, evidenceArr, Math.ceil(iterations/numWorkers)]);
			w.onmessage = function(e) {
				if (e.data[0]==0) {
					numComplete++;
					var workerBeliefs = e.data[1];
					var workerSamples = e.data[2];
					for (var i=0; i<workerBeliefs.length; i++) {
						//console.log(workerBeliefs, workerSamples);
						if (numComplete==1) {
							bn.nodes[i].beliefs = workerBeliefs[i];
							bn.nodes[i].samples = workerSamples[i];
						}
						else {
							var allBeliefs = bn.nodes[i].beliefs;
							var allSamples = Array.prototype.slice.call(bn.nodes[i].samples);
							for (var bi=0; bi<allBeliefs.length; bi++) {
								allBeliefs[bi] += workerBeliefs[i][bi];
								if (numComplete == numWorkers) {
									allBeliefs[bi] /= numComplete;
								}
							}
							allSamples.concat(workerSamples[i]);
							if (bn.nodes[i].funcDef && numComplete == numWorkers) {
								bn.nodes[i].discretizeFromSamples();
							}
						}
					}
					if (numComplete == numWorkers) {
						bn.updateExpectedValue();
						if (callback)  callback(bn);
					}
				}
				else if (e.data[0] == 1) {
					console.log(e.data);
				}
			};
		}
	},
	updateBeliefs_local: function(callback, iterations) {
		if (!iterations) { iterations = this.iterations; }
		var bn = this;

		this.compile();

		/// Convert evidence to array
		var evidenceArr = new Int32Array(new ArrayBuffer(bn.nodes.length*4));
		for (var i=0; i<evidenceArr.length; i++)  evidenceArr[i] = -1;
		for (var i in this.evidence)  evidenceArr[bn.nodesById[i].intId] = Number(this.evidence[i]);

		updateBeliefs_local(bn, evidenceArr, iterations);

		for (var i=0; i<bn.nodes.length; i++) {
			var node = bn.nodes[i];
			if (node.func) {
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

			if (_node.func) {
				/// Evidence not supported yet!
				if (evidence[_node.intId] != -1) {

				}
				else {
					/// Generate value for node
					var parents = _node.parents;
					for (var pi=0; pi<parents.length; pi++) {
						_node.parentStates[pi] = cas[parents[pi].intId];
					}
					cas[_node.intId] = _node.func(_node.parentStates);
				}
			}
			else if (_node.cpt) {
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
		var t, dt, st = 0;
		for (var i=0; i<this.perfLoops; i++) {
			t = performance.now();
			this.updateBeliefs_local(null, this.perfIterations);
			dt = performance.now() - t;
			st += dt;
		}
		alert(st/100);
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
				bn.updateBeliefs_worker(u, this.perfIterations);
			}
			else {
				alert(st/100);
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
	setupIndexes: function(nodes) {
		var indexes = new Array(nodes.length);
		for (var i=0; i<indexes.length; i++)  indexes[i] = 0;
		return indexes;
	},
	nextCombination: function(nodes, indexes) {
		var hasMore = false;
		for (var i=indexes.length-1; i>=0; i--) {
			indexes[i]++;
			if (indexes[i] >= nodes[i].states.length) {
				indexes[i] = 0;
			}
			else {
				hasMore = true;
				break;
			}
		}
		return hasMore;
	},
	prevCombination: function(nodes, indexes) {
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
	},
};