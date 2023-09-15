/***
	XXX - I need to clean out this utils.js file. Lots of unnecessary stuff.
***/

/// Polyfills
if (!Array.prototype.toSpliced) {
	Object.defineProperty(Array.prototype, 'toSpliced', {value: function (...args) {
		return Array.from(this).splice(...args);
	}});
}

if (typeof(console)=="undefined") {
	console = {
		log: function() {
			/*var div = document.createElement("div");
			for (var i=0; i<arguments.length; i++) {
				if (i!=0) { div.innerHTML += " &nbsp;"; }
				div.innerHTML += arguments[i];
			}
			document.body.appendChild(div);*/
		}
	};
}

/// Arg *must* be a function (so we can ignore any computations it might do if dbg is off)
var dbg = (arg) => {
	if (!dbg._on)  return;
	let res = arg(console.log);
	/*if (res!==undefined) {
		let errLine = new Error().stack.split(/\n/)[1];
		errLine = errLine.replace(/@.*\//, '@');
		console.log("%c%s", "color:#003eaa", errLine, ...(res?.[Symbol.iterator] && typeof(res)!='string' ? res : [res]));
	}*/
};
dbg._on = true;
dbg._origLog = console.log;
// xxx: dbg._stack = [];
Object.defineProperty(dbg, 'on', {get(){
	console.log = dbg._origLog;
	dbg._on=true;
	return _=>{};
}});
Object.defineProperty(dbg, 'off', {get(){
	console.log = _=>{};
	dbg._on=false;
	return _=>{};
}});
dbg.assert = (arg) => {
	let res = arg();
	if (!res) {
		//debugger;
		console.warn('Assertion failed', arg.toString());
		console.trace();
	}
};
// dbg = _=>{};
// dbg.on = null;
// dbg.off = null;
// dbg.assert = _=>{};

dbg.off;

var counters = {
	newFactor: 0,
	make: 0,
	moveVarToStart: 0,
	reduce: 0,
	multiplyFaster: 0,
	multiplyFaster3: 0,
	multiplyFaster4: 0,
	marginalize: 0,
	marginalize1: 0,
	marginalize2: 0,
	unitPotentials: 0,
	marginalHit: 0,
	multiplyHit: 0,
	jtreeMultiply: 0,
	jtreeMarginalize: 0,
	reset() {
		for (let i in this) {
			this[i] = 0;
		}
	},
	log(label = 'counters') {
		console.log(label);
		for (let [i,val] of Object.entries(this)) {
			console.log(i, val);
		}
	}
}
Object.defineProperty(counters, 'reset', {configurable:true,writable:true,enumerable:false,value:counters.reset});
Object.defineProperty(counters, 'log', {configurable:true,writable:true,enumerable:false,value:counters.log});
function allocFloat32(length) {
	return new Float32Array(length);
}

function pick(o, ...props) {
    return Object.assign({}, ...props.map(prop => typeof(o[prop])!=="undefined" ? {[prop]: o[prop]} : {}));
}

function zip(...rows) {
	return rows[0].map((_,i) => rows.map(row => row[i]));
}

function zipObject(fields, values) {
	return Object.fromEntries(zip(fields,values));
}

function unzipObject(obj) {
	return [Object.keys(obj),Object.values(obj)];
}

function mergeObjects(selectLeft, ...objs) {
	let retObj = Object.assign(objs[0]);
	for (let obj of objs.slice(1)) {
		for (let [k,v] of Object.entries(obj)) {
			let overwrite = !(k in retObj) || !selectLeft(retObj[k],obj[k]);
			if (overwrite) {
				retObj[k] = v;
			}
		}
	}
	return retObj;
}

function defaultGet(val, defaultValue) {
	return val===null || val===undefined ? defaultValue : val;
}

var Stats = class {
	n = 0;
	sum = 0;
	sumsq = 0;
	add(...v) {
		this.n += v.length;
		this.sum += v.reduce((a,v)=>a+v,0);
		this.sumsq += v.reduce((a,v)=>a+v**2,0);
	}
	mean() { return this.n ? this.sum/this.n : null; }
	/// Pop
	sd() { return this.n ? Math.sqrt(this.var()) : null; }
	var() { return this.n ? this.sumsq/this.n - (this.sum/this.n)**2 : null; }
	se() { return this.sd()/Math.sqrt(this.n); }
	str() { return `(n=${this.n}, μ=${sigFig(this.mean(),3)}, σ=${sigFig(this.sd(),3)}, se=${sigFig(this.se(),3)})`; }
};

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

/// This will replace a method with a method with listener hooks, and add the listener requested.
/// Will work with any non-locked down object, but it obviously assumes well-behaved methods.
/// And this still has lots of issues! (Like no async method support.)
function addMethodListener(obj, method, func, o = {}) {
	o.when ??= 'end';
	
	/// Get existing methodListener, or otherwise set it up
	let methodListener = obj[method]?.__methodListener ?? {
		start: [],
		end: [],
		originalFunction: obj[method],
	};
	
	/// Re-hook the method with our custom listener handler, but only
	/// if not already setup
	if (!obj[method]?._methodListener) {
		obj[method] = function ml(...args) {
			for (let listener of ml._methodListener.start) {
				listener.apply(obj, args);
			}
			let ret = ml._methodListener.originalFunction.apply(obj, args);
			for (let listener of ml._methodListener.end) {
				listener.apply(obj, args);
			}
			return ret;
		};
		obj[method]._methodListener = methodListener;
	}
	
	/// Now add our listener
	methodListener[o.when].push(func);
}

/// Check if element is visible (from jQuery)
function isVisible(elem) {
    return !!( elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length );
}

/// Check if element is in the viewport
function isElementInViewport (el) {

    // Special bonus for those using jQuery
    if (typeof jQuery === "function" && el instanceof jQuery) {
        el = el[0];
    }

    var rect = el.getBoundingClientRect();

    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) && /* or $(window).height() */
        rect.right <= (window.innerWidth || document.documentElement.clientWidth) /* or $(window).width() */
    );
}

/* innerText, etc., Firefox/Chrome, wow, much hurt. */
function getContenteditableText(el) {
	let qel = q(el).cloneNode(true).rootNew.qa('br:only-child').forEach(el => el.parentNode.childNodes.length==1?el.replaceWith('\n'):'').root;
	qel.qa('br:last-child').forEach(el => el.remove());
	qel.qa('br').forEach(el => el.replaceWith('\n'));
	qel.qa('div').forEach(div => !div.textContent.trim() ? '' :div.append('\n'));
	// console.log(qel.raw);
	return qel.innerText.replace(/\n$/, '');
}

function setContenteditableText(el, text) {
	el.textContent = text;
	el.innerHTML = el.innerHTML.replace(/\r\n/g, '\n').replace(/(.{0,0}(?=\n)|.+)(\n|$)/g, (m,p1)=>`<div>${p1?p1:'<br>'}</div>`);
}
if (typeof(HTMLElement)!=='undefined') {
	Object.defineProperty(HTMLElement.prototype, 'innerTextTEMPFIX', {
		get() {
			return getContenteditableText(this);
		},
		set(text) {
			setContenteditableText(this, text);
		},
	});
}

/// The range/selection stuff is super verbose
function selectContents(el) {
	let range = document.createRange();
	range.selectNodeContents(el);
	let sel = window.getSelection();
	sel.removeAllRanges();
	sel.addRange(range);
}

function setCaretEnd(el) {
	let range = document.createRange();
	range.selectNodeContents(el);
	range.setStart(range.endContainer, range.endOffset);
	let sel = window.getSelection();
	sel.removeAllRanges();
	sel.addRange(range);
}

function copyTextToClipboard(text) {
	let ta = document.createElement('textarea');
	ta.value = text;
	document.body.append(ta);
	ta.focus();
	ta.select();
	document.execCommand('copy');
	ta.remove();
}

/// Remove classes that match. `matches` is a function className => true/false.
function removeMatchingClasses(node, matches) {
	let cl = node.classList;
	for (let i=cl.length-1;i>=0;i--) {
		if (matches(cl[i])) {
			cl.remove(cl[i]);
		}
	}
}

function fileGetContents(file) {
	let reader = new FileReader();
	return new Promise(res => {
		reader.addEventListener('load', event => {
			res(event.target.result);
		});
		reader.readAsText(file);
	});
}


// https://stackoverflow.com/a/34192073/2094226
function copyHtmlToClipboard(html) {
  // Create container for the HTML
  // [1]
  var container = document.createElement('div')
  container.innerHTML = html

  // Hide element
  // [2]
  container.style.position = 'fixed'
  container.style.pointerEvents = 'none'
  container.style.opacity = 0

  // Detect all style sheets of the page
  var activeSheets = Array.prototype.slice.call(document.styleSheets)
    .filter(function (sheet) {
      return !sheet.disabled
    })

  // Mount the container to the DOM to make `contentWindow` available
  // [3]
  document.body.appendChild(container)

  // Copy to clipboard
  // [4]
  window.getSelection().removeAllRanges()

  var range = document.createRange()
  range.selectNode(container)
  window.getSelection().addRange(range)

  // [5.1]
  document.execCommand('copy')

  // [5.2]
  for (var i = 0; i < activeSheets.length; i++) activeSheets[i].disabled = true

  // [5.3]
  document.execCommand('copy')

  // [5.4]
  for (var i = 0; i < activeSheets.length; i++) activeSheets[i].disabled = false

  // Remove the container
  // [6]
  document.body.removeChild(container)
}

/// From https://stackoverflow.com/a/7478420/2094226
function getCaretPosition(el) {
    var atStart = false, atEnd = false;
    var selRange, testRange;
	var sel = window.getSelection();
	if (sel.rangeCount) {
		selRange = sel.getRangeAt(0);
		/// Only for caret, NOT selections
		if (selRange.toString().length == 0) {
			testRange = selRange.cloneRange();

			testRange.selectNodeContents(el);
			testRange.setEnd(selRange.startContainer, selRange.startOffset);
			atStart = (testRange.toString() == "");

			testRange.selectNodeContents(el);
			testRange.setStart(selRange.endContainer, selRange.endOffset);
			atEnd = (testRange.toString() == "");
		}
	}
    return { atStart, atEnd };
}

function problemWithObjectClone(obj) {
	let objsSeen = new Set();
	let problemPaths = [];
	(function canBeCloned(obj, path){
		for (var k in obj) {
			let val = obj[k];
			path.push(k);
			//onsole.log(path, val);
			/*if (typeof(obj[k]) == "object" && !objsSeen.has(obj[k])) {
				objsSeen.add(obj[k]);
				if (doCheckObj(obj[k], path)==="done")  return "done";
			}
			else {
				if (obj[k] instanceof jQuery || obj[k] instanceof HTMLElement) {
					console.log("Error: ", path, '["'+path.join('"]["')+'"]');
					return "done";
				}
			}*/
			let result = true;
			if (typeof(val) == "object" && val !== null && !objsSeen.has(val)) {
				objsSeen.add(val);
				switch({}.toString.call(val).slice(8,-1)) { // Class
					case 'Boolean':     case 'Number':      case 'String':      case 'Date':
					case 'RegExp':      case 'Blob':        case 'FileList':
					case 'ImageData':   case 'ImageBitmap': case 'ArrayBuffer':
					case 'Float32Array': case 'Int32Array':
						result = true;
						break;
					case 'Array':       case 'Object':
						result = canBeCloned(val, path);
						break;
					case 'Map':
						result = [...val.keys()].every(v => canBeCloned(v, path))
							&& [...val.values()].every(v => canBeCloned(v, path));
						break;
					case 'Set':
						result = [...val.keys()].every(v => canBeCloned(v, path));
						break;
					default:
						problemPaths.push({path: path.slice(), value: val});
						result = false;
				}
			}
			path.pop();
			if (!result)  return false;
		}
		return true;
	})(obj, []);
	return problemPaths.length ? problemPaths : false;
}

function readCsv(text, o = {}) {
	o.sep = o.sep || /\s*,\s*/;
	var lines = text.replace(/^\s*|\s*$/g, '').split(/\r?\n/);
	var data = [];
	for (var ent of lines.entries()) {
		var i = ent[0], line = ent[1];
		lines[i] = line.split(o.sep);
		if (i>0) {
			var row = {};
			for (var ent of lines[0].entries()) { var hi=ent[0],header=ent[1]; row[header] = lines[i][hi]; }
			data.push(row);
		}
	}
	return data;
}

function rgb2Hex(rgbStr) {
	let m = rgbStr.match(/\s*rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*/);
	if (m) {
		return '#'+m.slice(1).map(n => Number(n).toString(16)).join('');
	}
	return null;
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
function normalize2(vec) {
	var sum = 0;
	for (var i=0; i<vec.length; i++)  if (vec[i]>0)  sum += vec[i];

	var newVec = new Float32Array(vec.length);
	if (sum>0) {
		for (var i=0; i<vec.length; i++)  newVec[i] = vec[i]>0 ? vec[i]/sum : 0;
	}
	else {
		for (var i=0; i<vec.length; i++)  newVec[i] = 1/vec.length;
	}

	return newVec;
}
// In place normalize slightly faster
// function normalize2(vec) {
	// var sum = 0;
	// var i=0;

	// for (i=0; i<vec.length; i++)  if (vec[i]>0)  sum += vec[i];

	// if (sum>0) {
		// for (i=0; i<vec.length; i++)  vec[i] = vec[i]>0 ? vec[i]/sum : 0;
	// }
	// else {
		// for (i=0; i<vec.length; i++)  vec[i] = 1/vec.length;
	// }
// }

function testNorms() {
	let vecs = Array.from({length:100000}, _=>Array.from({length:10},_=>Math.random()));
	for (let i=0; i<10; i++) {
		console.time('vec'); vecs.forEach(vec => normalize(vec)); console.timeEnd('vec');
		console.time('vec2'); vecs.forEach(vec => normalize2(vec)); console.timeEnd('vec2');
	}
}

// ECMAScript 5 polyfill
Object.defineProperty(Array.prototype, 'stableSort', {
	configurable: true,
	writable: true,
	value: function stableSort (compareFunction) {
	  'use strict'
  
	  var length = this.length
	  var entries = Array(length)
	  var index
  
	  // wrap values with initial indices
	  for (index = 0; index < length; index++) {
		entries[index] = [index, this[index]]
	  }
  
	  // sort with fallback based on initial indices
	  entries.sort(function (a, b) {
		var comparison = Number(this(a[1], b[1]))
		return comparison || a[0] - b[0]
	  }.bind(compareFunction))
  
	  // re-map original array to stable sorted values
	  for (index = 0; index < length; index++) {
		this[index] = entries[index][1]
	  }
	  
	  return this
	}
  });

/**
Generic (and very simple) listener handling, with arbitrary names. (Based on intent, not declaration --- unless you declare them.)
e.g. 'change.myGroup' or ['change', 'myGroup'] or ['change',jsObj]
*/
class Listeners {
	constructor(declared = []) {
		this.listeners = [];
		this.declared = declared; /// Declared types. If empty, never throws error. If non-empty, checks this list before doing anything
		// this.groups = {};
	}
	
	/*
	Test:
	getTypeGroup('event')
	getTypeGroup(['event',{}])
	getTypeGroup(['event.mygroup',{}])
	getTypeGroup(['event.mygroup'])
	getTypeGroup('event.mygroup')
	getTypeGroup('event.mygroup')
	
	*/
	getTypeGroup(typeGroup) {
		let type = typeGroup;
		let group = null;
		let listenerGroup = null;
		if (Array.isArray(typeGroup)) {
			[type,group,listenerGroup] = typeGroup;
		}
		let typeAndGroup = typeof(type)=='string' ?
				(type.includes(' ') ?
					type.split(/\s/)
						.map(tg => this.getTypeGroup(tg))
						.reduce((a,v) => [a[0].concat(v[0]),a[1].concat(v[1] || group)], [[],[]])
					: type.split(/\./))
			: [null,type];
		if (typeAndGroup.length==1)  typeAndGroup.push(group);
		if (typeAndGroup.length==2 && listenerGroup)  typeAndGroup.push(listenerGroup);
		return typeAndGroup;
	}
	
	declare(declared = []) {
		this.declared.push(...declared);
	}
	
	typeOk(type) {
		return !this.declared.length || this.declared.includes(type);
	}
	
	add(typeGroup, func) {
		if (!func)  return;
		/// XXX: Make listener indexing more efficient? Is it worthwhile?
		let [type,group='$$default$$',listenerGroup] = this.getTypeGroup(typeGroup);
		if (Array.isArray(type)) {
			type.forEach((type,i) => this.add([type,group[i],listenerGroup], func));
			return this;
		}
		if (!this.typeOk(type))  { console.error(`${type} not a recognised listener in |Listener.add|.`); return; }
		// if (!(type in this.listeners))  this.listeners[type] = [];
		// if (!(group in this.groups))  this.groups[group] = [];
		let entry = {type, group, func, listeners:this, listenerGroup};
		// this.listeners[type].push(entry);
		// this.groups[group].push(entry);
		this.listeners.push(entry);
		if (group instanceof Listeners)  group.listeners.push(entry);
		if (listenerGroup instanceof Listeners)  listenerGroup.listeners.push(entry);
		return this;
	}
	
	get(typeGroup, func) {
		let [type,group='$$default$$'] = this.getTypeGroup(typeGroup);
		if (Array.isArray(type)) {
			return type.map((type,i) => this.get([type,group[i]], func)).flat();
		}
		if (type && !this.typeOk(type))  { console.error(`${type} not a recognised listener |Listener.get|.`); }
		let predList = [];
		if (group!='$$default$$') {
			predList.push(l => l.group == group);
		}
		if (type) {
			predList.push(l => l.type == type);
		}
		if (func) {
			predList.push(l => l.func == func);
		}
		return this.listeners.filter(l => predList.reduce((a,p) => a && p(l), true));
	}
	
	notify(typeGroup, ...args) {
		this.get(typeGroup).forEach(l => l.func(...args));
	}
	
	remove(typeGroup, func) {
		let [type,group='$$default$$'] = this.getTypeGroup(typeGroup);
		if (type && !this.typeOk(type))  { console.error(`${type} not a recognised listener |Listener.remove|.`); }
		let predList = [];
		if (group!='$$default$$') {
			predList.push(l => l.group == group);
		}
		if (type) {
			predList.push(l => l.type == type);
		}
		if (func) {
			predList.push(l => l.func == func);
		}
		let removed = this.listeners.filter(l => predList.reduce((a,p) => a && p(l), true));
		this.listeners = this.listeners.filter(l => !predList.reduce((a,p) => a && p(l), true));
		removed.forEach(entry => {
			if (entry.listeners != this) {
				entry.listeners.remove([entry.type,entry.group],entry.func);
			}
			else {
				if (entry.group instanceof Listeners) {
					entry.group.remove([entry.type,entry.group],entry.func);
				}
				if (entry.listenerGroup instanceof Listeners) {
					entry.listenerGroup.remove([entry.type,entry.group],entry.func);
				}
			}
		});
		return removed;
	}
}

class DOMListeners extends Listeners {
	constructor(el, declared = []) {
		super(declared);
		this.el = el;
	}
	
	add(typeGroup, func, opts = null) {
		let [type,group] = this.getTypeGroup(typeGroup);
		super.add(typeGroup, func);
		this.el.addEventListener(type, func, opts);
		return this;
	}
	
	remove(typeGroup, func) {
		let [type,group] = this.getTypeGroup(typeGroup);
		let removed = super.remove(typeGroup, func);
		for (let {type, func} of removed) {
			this.el.removeEventListener(type, func);
		}
	}
}

class ListenerGroup extends Listeners {
	add(obj, typeGroup, func, opts = null) {
		let listeners = obj.listeners instanceof Listeners ? obj.listeners : q(obj.jquery ? obj[0] : obj).listeners;
		listeners.add(this.getTypeGroup(typeGroup).concat([this]), func);
		return this;
	}
	
	remove(obj, typeGroup, func) {
		if (obj!=undefined && !Array.isArray(obj) && typeof(obj)!='string') {
			let listeners = obj.listeners instanceof Listeners ? obj.listeners : q(obj.jquery ? obj[0] : obj).listeners;
			listeners.remove(this.getTypeGroup(typeGroup), func);
		}
		return super.remove(...arguments);
	}
}

/** 
    2017-10-01 NOTE: Every undo entry is now a chain (possibly only of length 1)
	
    Notes on saving state in a |change| object. We should save the state that we need as properties of |change|.
	Must keep things that don't change for a given state (like string IDs) rather than
	things that can (like object references), because (for instance) we might delete a node, in which
	case the object reference will be different sometimes when running through the undos/redos.

	(We can keep a reference to the net, because a net change is not undoable).
**/
class UndoList {
	constructor() {
		this.list = [];
		this.index = 0;
		this.revisionInProgress = false;
		this.combiningFromIndex = [];
		this.undoListeners = [];
	}
	
	runUndoListeners(event) {
		event.undoList = this;
		this.undoListeners.forEach(listener => listener(event));
	}
	
	/// Throws an error if list is empty
	last() {
		return this.list[this.list.length-1];
	}
	
	/// Return the very last action (which might be nested deeply in some chains)
	lastAction() {
		let chain = this.list?.[this.list.length-1];
		if (!chain)  return null;
		while (chain.chain)  chain = chain.chain;
		
		return chain[chain.length-1];
	}
	
	/**
		|change| should be an object of the following form:
		
		{name: <name of change>, undo: <undo function>, redo: <redo function>}
		
		OR
		
		{name: <name of change>, new: <the new state>, old: <the old state>, exec(current): <func that takes current state>}
		
		Add |withPrevious: true| for a chain of actions that need to be undone/redone together.
	*/
	add(change) {
		if (!this.revisionInProgress) {
			let doAdd = true;
			if (change.withPrevious && this.list.length) {
				let lastItem = this.list[this.list.length-1];
				if (lastItem.type == 'combined') {
					lastItem.chain.push(change);
					doAdd = false;
				}
				else {
					change = this.makeCombined(lastItem, change);
					this.index--;
				}
			}
			else {
				/// 2017-10-01 Every undo entry is now a chain (possibly only of length 1)
				change = this.makeCombined(change);
			}
			if (doAdd) {
				this.list[this.index] = change;
				this.index++;
				/// Any new change, truncates the undo list
				this.list.length = this.index;
				/// Fire change listeners
				this.runUndoListeners({type: 'add'});
			}
		}
	}
	
	addAndDo(change) {
		if (typeof(change.old)!="undefined" && typeof(change.new)!="undefined" && typeof(change.exec)!="undefined") {
			if (!change.redo)  change.redo = function() { this.exec(this.new, this.old); }
			if (!change.undo)  change.undo = function() { this.exec(this.old, this.new); }
		}
		this.add(change);
		change.redo();
	}

	addFinallyAndDo(action) {
		this.last().addFinallyAndDo(action);
	}

	addFinally(action) {
		this.last().addFinally(action);
	}
	
	/**
	Make a undo item that executes several actions at once. The |finally| property is a list
	of actions that will always get executed at the end (whether undoing or redoing).
	*/
	makeCombined(...changes) {
		return {
			type: 'combined',
			chain: changes,
			finally: [],
			undo() {
				for (var action of this.chain.slice().reverse())  action.undo();
				for (var action of this.finally)  action();
			},
			redo() {
				for (var action of this.chain)  action.redo();
				for (var action of this.finally)  action();
			},
			addFinally(action) {
				this.finally.push(action);
			},
			addFinallyAndDo(action) {
				this.addFinally(action);
				action();
			},
		};
	}
	
	/// Not multi-thread-friendly
	doCombined(func) {
		this.startCombined();
		func();
		this.endCombined();
	}
	
	startCombined(startI = this.index) {
		this.combiningFromIndex.push( Math.max(0,startI) );
	}
	
	endCombined(endI = this.index-1) {
		console.log("combining:", this.combiningFromIndex, this.combiningFromIndex[this.combiningFromIndex.length-1], endI);
		let startI = this.combiningFromIndex.pop();
		let n = (endI - startI)+1;
		//if (typeof(startI)=="undefined")  throw new Error("endCombined called without startCombined");
		if (n==0 || typeof(startI)=="undefined")  return;
		
		let combined = this.list.slice(startI, startI+n).reduce((a,v) => {
			a.chain = a.chain.concat(v.chain);
			a.finally = a.finally.concat(v.finally);
			return a;
		});
		
		this.list.splice(startI, n, combined);
		this.index -= (n-1);
	}
	
	linkToPrevious(index = this.list.length-1) {
		if (index-1 >= 0) {
			let lastItem = this.list[index-1];
			if (lastItem.type == 'combined') {
				lastItem.chain.push(this.list[index]);
			}
			else {
				let change = this.makeCombined(lastItem, this.list[index]);
				this.list[index-1] = change;
			}
			this.list.splice(index, 1);
			if (this.index >= index) {
				this.index--;
			}
		}
	}
	
	undo() {
		if (this.index > 0) {
			this.revisionInProgress = true;
			try {
				do {
					this.index--;
					this.list[this.index].undo();
				} while (this.list[this.index].withPrevious);
			}
			finally {
				this.runUndoListeners({type:'undo'});
				this.revisionInProgress = false;
			}
		}
	}
	
	redo() {
		if (this.index < this.list.length) {
			this.revisionInProgress = true;
			try {
				do {
					this.list[this.index].redo();
					this.index++;
				} while (this.list[this.index] && this.list[this.index].withPrevious);
			}
			finally {
				this.runUndoListeners({type:'redo'});
				this.revisionInProgress = false;
			}
		}
	}
	
	reset() {
		this.list.length = 0;
		this.index = 0;
	}
}

function makeSimpleBn(str) {
	var bn = new BN();
	var cleanName = n => n.trim().replace(/[^0-9a-zA-Z]/g, '_');
	var lines = str.split(/\r?\n/);
	for (var line of lines) {
		var pair = line.split(/->/);
		if (pair.length == 2) {
			var node1 = cleanName(pair[0]);
			var node2 = cleanName(pair[1]);
			if (!bn.nodesById[node1])  bn.addNode(node1, ["s0","s1"]);
			if (!bn.nodesById[node2])  bn.addNode(node2, ["s0","s1"]);
			bn.nodesById[node1].addChildren([node2]);
		}
	}
	return bn;
}

function changeQsUrl(url, nameValues) {
    url = url.replace(/^&|&$/g, "");
    var found = url.match(/^([^?]*\??)(.*)/);
    if (found) {
    	if (found[1].charAt(found[1].length-1)!='?') {
    		found[1] += '?';
    	}
		var newQs = changeQs(nameValues, found[2]);
		if (newQs) {
			return found[1]+newQs;
		}
		return found[1].slice(0,-1);
    }
    return "";
}

function changeQs(nameValues, qs) {
	var qs = "&"+qs;
	for (name in nameValues) {
		var re = new RegExp("&"+name+"=[^&]*", "gi");
		qs = qs.replace(re, "");
		qs = qs.replace(/^&/, "");
		if (qs!="") { qs += "&"; }
		if (nameValues[name]!==null) {
			qs += name + "=" + escape(nameValues[name]);
		}
	}
	qs = qs.replace(/^&/, "");
	return qs;
}

if (typeof(jQuery)!="undefined")  (function($, undefined) {
if (!$.uncamelCase) {
    // Convert camelCase to dashed
    $.uncamelCase = function(string) {
        return string.replace( /([A-Z])/g, '-$1' )
            .toLowerCase().replace( /^-/, '');
    };
}

/// Adapted from: http://jsfiddle.net/rodneyrehm/XV33m/
/// This will dispatch to data() and attr() (unlike jQuery's data,
/// which only stores things internally, and not in the DOM).
/// Note: Not defined for object values.
$.fn.dataAttr = function(key, value) {
    var $this = this,
        ret = this.data(key, value);
    
    if (typeof key == "object") {
        $.each(key, function(key, value) {
            $this.attr("data-" + jQuery.uncamelCase(key), typeof value in {string:1, number:1} ? value : '~defined~');
        });
    } else if (value !== undefined) {
        $this.attr("data-" + jQuery.uncamelCase(key), typeof value in {string:1, number:1} ? value : '~defined~');
    }
    
    return ret;
};

$(function() {
    $('#data').on('click', function(e){
        e.preventDefault();
        $(this).dataAttr('hello', "yeah");
    });

    $('#data2').on('click', function(e){
        e.preventDefault();
        $(this).dataAttr('hello', 1);
    });

    $('#data3').on('click', function(e){
        e.preventDefault();
        $(this).dataAttr('hello', {foo: true});
    });
});

})(jQuery);


/// I've no idea why these aren't implemented in JS Sets by default
Set.prototype.isSuperset = function(subset) {
    for (var elem of subset) {
        if (!this.has(elem)) {
            return false;
        }
    }
    return true;
}

Set.prototype.isSubset = function(subset) {
    for (var elem of this) {
        if (!subset.has(elem)) {
            return false;
        }
    }
    return true;
}

Set.prototype.union = function(setB) {
    var union = new Set(this);
    for (var elem of setB) {
        union.add(elem);
    }
    return union;
}

Set.prototype.intersection = function(setB) {
    var intersection = new Set();
    for (var elem of setB) {
        if (this.has(elem)) {
            intersection.add(elem);
        }
    }
    return intersection;
}

Set.prototype.difference = function(setB) {
    var difference = new Set(this);
    for (var elem of setB) {
        difference.delete(elem);
    }
    return difference;
}

function popupElement(el, parent, eventOrX, offsetOrY = 5, offset = 0) {
	let parentBounds = parent.getBoundingClientRect();
	let x = eventOrX;
	let y = offsetOrY;
	//let offset = 5;
	if (typeof(eventOrX)=="object" && eventOrX!==null && 'clientX' in eventOrX) {
		x = eventOrX.clientX - parentBounds.left;
		y = eventOrX.clientY - parentBounds.top;
		offset = offsetOrY;
	}
	el.style.top = (y+offset)+"px";
	el.style.left = (x+offset)+"px";
	el.style.display = 'block';
	parent.append(el);
	
	/// Adjust if falls out of boundaries
	let elBounds = el.getBoundingClientRect();
	let rightOverflow = elBounds.right - parentBounds.right;
	let bottomOverflow = elBounds.bottom - parentBounds.bottom;
	if (rightOverflow > 0) {
		el.style.left = (x - elBounds.width - offset)+'px';
	}
	if (bottomOverflow > 0) {
		el.style.top = (y - elBounds.height - offset)+'px';
	}
	let newElBounds = el.getBoundingClientRect();
	let leftOverflow = -(newElBounds.left - parentBounds.left);
	let topOverflow = -(newElBounds.top - parentBounds.top);
	
	//console.log(parentBounds.bottom, y, newElBounds.height, bottomOverflow, (y - bottomOverflow));
	
	if (leftOverflow > 0 && rightOverflow > 0) {
		el.style.left = (x - rightOverflow)+'px';
	}
	if (topOverflow > 0 && bottomOverflow > 0) {
		el.style.top = (y - bottomOverflow)+'px';
	}
}

/***
	Below, unchecked.
***/

function inArray(el, arr) {
	for (var i=0; i<arr.length; i++) {
		if (arr[i]==el) {
			return true;
		}
	}
	return false;
}

function genPass(length) {
	var pwd;
	pwd = "";
	for (i=0;i<length;i++) {
		pwd += String.fromCharCode(Math.floor((Math.random()*25+65)));
	}
	return pwd.toLowerCase();
}

function setSelect(pForm, id) {
	if (pForm.sel.length) {
		pForm.sel[id].checked = true;
	}
	else {
		pForm.sel.checked = true;
	}
}

function keyCount(arr) {
	var c = 0;
	for (var i in arr) {
		c++;
	}
	return c;
}

/// For the given data table, check that all the fields specified in options.fields
/// have values filled in
/// options = {
///   fields: <Array of field names or pos>,
///   alert: <bool, put up an alert>
/// }
function checkTableForBlanks(dataTable, options) {
	if (!options.fields) { options.fields = {}; }

	var blankFields = [];
	for (var r=0; r<dataTable.getNumRows(); r++) {
		for (var f=0; f<options.fields.length; f++) {
			if (Table_purchases.getValue(r, options.fields[f])==="") {
				blankFields.push([r, options.fields[f]]);
			}
		}
	}

	if (options.alert && blankFields.length > 0) {
		var str = "";
		for (var i=0; i<blankFields.length; i++) {
			str += "Row "+(blankFields[i][0]+1)+", "+dataTable.getHeader(blankFields[i][1])+"\n";
		}
		alert("The table is missing the following fields:\n"+str);
		dataTable.focusCell(Table_purchases.getCell(blankFields[0][0], blankFields[0][1]));
	}

	if (blankFields.length>0) {
		return blankFields;
	}

	return false;
}

/**
fields: should be in {name1: label1, name2: label2, ...} format
*/
function checkForBlanks(formOrTable, prefix, fields, noAlert, checkAllFormFields) {
	/// 2009-02-04-SM: Not sure what the purpose of following is:
	if (typeof(formOrTable.getValue)=="function") {
		var table = formOrTable;
		fields = prefix;
		noAlert = fields;
		checkAllFormFields = noAlert;

	}
	else {
		var form = formOrTable;
		var blanksFound = [];
		var elToFocus = null;

		for (var i=0; i<form.elements.length; i++) {
			var found = form.elements[i].name.match(new RegExp("^"+prefix+"(.*)"));
			if (found) {
				if (form.elements[i].value=="" || form.elements[i].value==null) {
					if (checkAllFormFields || typeof(fields[found[1]])!="undefined") {
						blanksFound[blanksFound.length] = (!fields || typeof(fields[found[1]])=="undefined" ? form.elements[i].name : fields[found[1]]);
						/// Focus first blank element
						if (!elToFocus) { elToFocus = form.elements[i]; }
					}
				}
			}
		}
		if (blanksFound.length>0) {
			if (!noAlert) {
				str = "The following required fields are blank:\n";
				for (var i=0; i<blanksFound.length; i++) {
					str+= blanksFound[i]+"\n";
				}
				alert(str);
				elToFocus.focus();
				return true;
			}
			return blanksFound;
		}
	}
	return false;
}

function moveOptions(from, to) {
	var i;
	for (i = 0; i<from.options.length; i++) {
		if (from.options[i].selected) {
			opt = from.options[i];
			opt2 = new Option(opt.text, opt.value, false, false);
			to[to.length] = opt2;
			from.options[i] = null;
			i--;
		}
	}
}

function forEachIndex(arr, callback) {
	for (var i=0; i<arr.length; i++) {
		///Relying on closures, here. Efficiency shouldn't be a problem, because
		///function isn't returned to anything (efficiency shouldn't be a problem in any case
		///where the function doesn't refer to the parent scope either, but apparently it is).
		callback(i);
	}
}

function addMultipleSelect(selBox, text, value) {
	if (!value) {
		value = text;
	}
	if (text!="") {
		opt = new Option(text, value, false, false);
		selBox.options[selBox.options.length] = opt;
		selectNone(selBox);
		return true;
	}
	return false;
}

function remMultipleSelect(selBox) {
	var i;
	for (i = 0; i<selBox.options.length; i++) {
		if (selBox.options[i].selected) {
			selBox.options[i] = null;
			i--;
		}
	}
}

function removeAllOptions(selBox) {
	selBox.options.length = 0;
	/*for (var i=selBox.options.length-1; i>=0; i--) {
		selBox.options[i] = null;
	}*/
}

function moveTo(selBox, pos) {
	var prevSelected = false;
	var noMove = false;
	for (var i=0; i<selBox.options.length; i++) {
		if (selBox.options[i].selected) {
			if (!(prevSelected && noMove) && (i>0)) {
				var j = i;
				while (j>pos) {
					var o1 = selBox.options[j];
					var o3 = new Option(o1.text, o1.value, false, false);
					var o2 = selBox.options[j - 1];
					var o4 = new Option(o2.text, o2.value, false, false);
					selBox.options[j] = o4;
					selBox.options[j - 1] = o3;
					selBox.options[j].selected = false;
					prevSelected=true;
					noMove=false;
					selBox.options[j - 1].selected=true;
					j--;
				}
			}
			else {
				prevSelected=true;
				noMove=true;
			}
		}
		else {
			prevSelected=false;
			noMove=false;
		}
	}
}

function Timer() {
	this.time = new Date().getTime();
}
Timer.prototype = {
	checkTime: function() {
		return new Date().getTime() - this.time;
	}
};


/*
Source should be like the following JSON:
[["value1", "display1"], ["value2", "display2"]]
*/
function fillSelect(sel, source) {
	function doFill(str) {
		eval('var opts = '+str);
		removeAllOptions(sel);
		for (var i=0; i<opts.length; i++) {
			sel.options[sel.options.length] = new Option(opts[i][1], opts[i][0]);
		}
	}
	if (typeof(sel)=="string") { sel = gbid(sel); }
	if (source.search(/^data:/)!=-1) {
		doFill(source.replace(/^data:/, ''));
	}
	else {
		sel.options[0] = new Option("Loading...", "");
		sel.selectedIndex = 0;
		var t = new Timer();
		getLivePage(source, function(httpr) {
			if (httpr.readyState==4) {
				window.setTimeout(function(){doFill(httpr.responseText);}, (x = 200 - t.checkTime(), x<0 ? 0 : x));
			}
		});
	}
}

function moveUp(selBox) {
	var prevSelected = false;
	var noMove = false;
	for (var i=0; i<selBox.options.length; i++) {
		if (selBox.options[i].selected) {
			if (!(prevSelected && noMove) && (i>0)) {
				var o1 = selBox.options[i];
				var o3 = new Option(o1.text, o1.value, false, false);
				var o2 = selBox.options[i - 1];
				var o4 = new Option(o2.text, o2.value, false, false);
				selBox.options[i] = o4;
				selBox.options[i - 1] = o3;
				selBox.options[i].selected = false;
				prevSelected=true;
				noMove=false;
				selBox.options[i - 1].selected=true;
			}
			else {
				prevSelected=true;
				noMove=true;
			}
		}
		else {
			prevSelected=false;
			noMove=false;
		}
	}
}

function moveDown(selBox) {
	var prevSelected = false;
	var noMove = false;
	for (var i=(selBox.options.length-1); i>=0; i--) {
		if (selBox.options[i].selected) {
			if (!(prevSelected && noMove) && (i+1<selBox.options.length)) {
				var o1 = selBox.options[i];
				var o3 = new Option(o1.text, o1.value, false, false);
				var o2 = selBox.options[i + 1];
				var o4 = new Option(o2.text, o2.value, false, false);
				selBox.options[i] = o4;
				selBox.options[i + 1] = o3;
				selBox.options[i].selected = false;
				prevSelected=true;
				noMove=false;
				selBox.options[i + 1].selected=true;
			}
			else {
				prevSelected=true;
				noMove=true;
			}
		}
		else {
			prevSelected=false;
			noMove=false;
		}
	}
}

function setSelectFromText(sel, txt) {
	for (var i=0; i<sel.options.length; i++) {
		if (sel.options[i].text==txt) {
			sel.options[i].selected = true;
			return;
		}
	}
}

function selectAll(selBox) {
	for (var i=0; i<selBox.options.length; i++) {
		selBox.options[i].selected = true;
	}
}

function setAllChecks(frm, named, val) {
	for (var i=0; i<frm.elements.length; i++) {
		if (frm.elements[i].name==named) {
			frm.elements[i].checked = val;
		}
	}
}

/*Duplicates the above, but ah, who cares.*/
function selectNone(selBox) {
	for (var i=0; i<selBox.options.length; i++) {
		selBox.options[i].selected = false;
	}
}

function getFirstSelected(selBox) {
	for (var i=0; i<selBox.options.length; i++) {
		if (selBox.options[i].selected) {
			return selBox.options[i];
		}
	}
	return null;
}

/*Sets all the values in the form to the default nothing for the type of control*/
function clearForm(frm, elToFocus, allowRestore) {
	for (var i=0; i<frm.elements.length; i++) {
		///If it's my custom search control
		if (frm.elements[i].type=="select-one" && !frm.elements[i].getAttribute("noclear")) {
			if (allowRestore) { frm.elements[i].clearedValue = frm.elements[i].value; }
			var firstText = frm.elements[i].options[0].text;
			if (firstText == "All" || firstText == "" || firstText.charAt(firstText.length-1) == ":") {
				frm.elements[i].selectedIndex = 0;
			}
			else {
				frm.elements[i].selectedIndex = -1;
			}
		}
		else if (frm.elements[i].type=="select-multiple" && !frm.elements[i].getAttribute("noclear")) {
			if (allowRestore) {
				frm.elements[i].clearedValue = "";
				for (var j=0; j<frm.elements[i].options.length; j++) {
					if (frm.elements[i].options[j].selected) {
						frm.elements[i].clearedValue += ","+j;
					}
				}
			}
			selectNone(frm.elements[i]);
		}
		else if (frm.elements[i].getAttribute("doclear")) {
			//Custom search control
			eval(frm.elements[i].getAttribute("doclear"));
		}
		else if (frm.elements[i].type=="text" || frm.elements[i].type=="textarea") {
			if (allowRestore) { frm.elements[i].clearedValue = frm.elements[i].value; }
			frm.elements[i].value = "";
		}
	}
	if (elToFocus) {
		elToFocus.focus();
	}
}

function restoreForm(frm, elToFocus) {
	for (var i=0; i<frm.elements.length; i++) {
		if (typeof(frm.elements[i].clearedValue)!="undefined") {
			///If it's my custom search control
			if (frm.elements[i].type=="select-one" && !frm.elements[i].getAttribute("noclear")) {
				frm.elements[i].value = frm.elements[i].clearedValue;
			}
			else if (frm.elements[i].type=="select-multiple" && !frm.elements[i].getAttribute("noclear")) {
				var clearedValues = frm.elements[i].clearedValue.split(',');
				for (var j=0; j<clearedValues.length; j++) {
					if (!isNaN(parseInt(clearedValues[j]))) {
						frm.elements[i].options[clearedValues[j]].selected = true;
					}
				}
			}
			else if (frm.elements[i].getAttribute("dorestore")) {
				//Custom search control
				eval(frm.elements[i].getAttribute("dorestore"));
			}
			else if (frm.elements[i].type=="text" || frm.elements[i].type=="textarea") {
				frm.elements[i].value = frm.elements[i].clearedValue;
			}
		}
	}
	if (elToFocus) {
		elToFocus.focus();
	}
}

function getForm(el) {
	while (el && el.tagName!="FORM") {
		el = el.parentNode;
	}
	return el;
}

function pushArr(arr, el) {
	arr[arr.length] = el;
}

function verifyLockDate(txt, dt1) {
	var dt = dateStringToDate(txt.value);
	if (!dt) {
		alert("Date blank or not in required format");
		return false;
	}
	var dt1 = dt.getTime();
	if (dt1<lockBefore) {
		alert("Can't enter dates before "+dateToDateString(new Date(lockBefore)));
		txt.focus();
		return false;
	}
	return true;
}

function round(num, decimals) {
	var p = Math.pow(10,decimals);
	return Math.round(num*p)/p;
}

function checkPwd(frm) {
	if (frm.pwd.value == "y") {
		return true;
	}
	alert("incorrect password");
	return false;
}

var deleteClicked = false;

function checkDelete(thing) {
	if (deleteClicked) {
		deleteClicked = false;
		return confirm("Delete the "+thing+"?");
	}
	return true;
}

function cookieEscape(str) {
	return str.replace(/~/g, '~1').replace(/;/g, '~2');
}

function cookieUnescape(str) {
	return str.replace(/~2/g, ';').replace(/~1/g, '~');
}

var SC_PERMANENT = -1;
var SC_SESSION = -2;
function setCookie(name, value, expire, path) {
	if    (expire==SC_PERMANENT) { expire = new Date(2030,0,1); }
	else if (expire==SC_SESSION) { expire = null; }
	var str = name + "=" + cookieEscape(value)
	+ ((expire == null) ? "" : ("; expires=" + expire.toGMTString()))
	+ ((path==null)? "; path=/" : ("; path="+path));
	document.cookie = str;
	//onsole.log(str);
}

function getCookie(name) {
	if (document.cookie.length == 0) return null;
	var cookieStrs = document.cookie.split(";");
	var re = new RegExp("^\\s*"+name+"=(.*)$");
	for (var i=0; i<cookieStrs.length; i++) {
		if (  (m = cookieStrs[i].match(re))  ) {
			return cookieUnescape(m[1]);
		}
	}
	return null;
}

function yieldCookie(name, initialValue) {
	if (!hasCookie(name)) {
		setCookie(name, initialValue, SC_PERMANENT);
	}
	return getCookie(name);
}

function hasCookie(name) {
	var search = name + "=";
	if (document.cookie.length > 0) {
		if (document.cookie.indexOf(search)!=-1) {
			return true;
		}
	}
	return false;
}

function deleteCookie(name) {
	setCookie(name, "", new Date(new Date().getTime()-100));
}

/// Keys are of the following form: name1.name2 or even name1.name2.name3..., name1.name2[name3]
/// The first and second name MUST be present
if (typeof(setCrumb_CookieType)=="undefined") {
	var setCrumb_CookieType = SC_PERMANENT;
}
function setCrumb(key, value, cookieTime) {
	var keys = key.match(/(.*?)\.(.*)/);
	if (!keys) { return false; }
	var key = keys[1];
	var subKeys = keys[2].split(".");
	var ob = parseJSON(getCookie(key));
	if (!ob || typeof(ob)!="object" || isArray(ob)) { ob = {}; }
	var eachOb = ob;
	for (var i=0; i<subKeys.length-1; i++) {
		if (typeof(eachOb[subKeys[i]]) == "undefined") {
			eachOb[subKeys[i]] = {};
		}
		eachOb = eachOb[subKeys[i]];
	}
	eachOb[subKeys[subKeys.length-1]] = value;
	if (!cookieTime) {
		cookieTime = setCrumb_CookieType;
	}
	//onsole.log("hi", toJSONString(value), ob, toJSONString(ob));
	setCookie(key, toJSONString(ob), cookieTime);
}

function getCrumb(key) {
	var keys = key.match(/(.*?)\.(.*)/);
	if (!keys) { return false; }
	var key = keys[1];
	var subKey = keys[2];
	var ob = parseJSON(getCookie(key));
	return eval("ob."+subKey);
}

function isArray(ob) {
	return ob && typeof(ob.length)!="undefined";
}

/// Diff between yieldCrumb/getCrumb: yieldCrumb will return 'returnIfNew'
/// when the crumb doesn't exist (that is, it will always try to /yield/ something)
function yieldCrumb(key, returnIfNew) {
	if (!hasCrumb(key)
			|| (!isArray(returnIfNew) && getCrumb(key).length===0)
			|| (isArray(returnIfNew) && !isArray(getCrumb(key)))
			) {
		//onsole.log("setCrumb", returnIfNew);
		setCrumb(key, returnIfNew);
		return returnIfNew;
	}
	return getCrumb(key);
}

function hasCrumb(key) {
	var keys = key.match(/(.*?)\.(.*)/);
	if (!keys) { return false; }
	var key = keys[1];
	var subKey = keys[2];
	var search = key + "=";
	if (document.cookie.length > 0 && document.cookie.indexOf(search)!=-1) {
		var ob = parseJSON(getCookie(key));
		var subKeyExists = eval("typeof(ob."+subKey+")!='undefined'");
		return subKeyExists;
	}
	return false;
}

function deleteCrumb(key, cookieTime) {
	var keys = key.match(/(.*?)\.(.*)/);
	if (!keys) { return false; }
	var key = keys[1];
	var subKey = keys[2];
	var ob = parseJSON(getCookie(key));
	eval("delete ob."+subKey);
	setCookie(key, toJSONString(ob), cookieTime);
}

var Crumb = {
	cookieTime: SC_PERMANENT,
	set: function(key, value) {
		setCrumb(key, value, this.cookieTime);
	},
	get: function(key) {
		return getCrumb(key);
	},
	yield: function(key, returnIfNew) {
		return yieldCrumb(key, returnIfNew);
	},
	has: function(key) {
		return hasCrumb(key);
	},
	remove: function(key) {
		deleteCookie(key, this.cookieTime);
	},

	ENDCRUMBS: 0
};

function setTransactionJournalDates(frm) {
	if (!frm.fromDate.value) {
		setCookie('fromDate', 'null');
	}
	else {
		setCookie('fromDate', dateStringToDate(frm.fromDate.value).toGMTString());
	}
	if (!frm.toDate.value) {
		setCookie('toDate', 'null');
	}
	else {
		setCookie('toDate', dateStringToDate(frm.toDate.value).toGMTString());
	}
}

///Just gets first instance of var in qs
function getFirstQsVar(name, qs) {
	var qs = "&"+qs;
	var re = new RegExp("&"+name+"=([^&]*)", "i");
	var found = qs.match(re);
	if (found) {
		return unescape(found[1]);
	}
	return null;
}

/**
	This extracts the query string arguments from 'url'.
	Automatically creates arrays when arguments are specified more than once.
	(You can also force array creation for particular arguments, even if it has just 1 element.)
	Returns:
		Hash of arguments => values
	Example calls:
		var args = getUrlArgs(document.URL, {expression:true}); ///Forces expression arg to be an array
**/
function getUrlArgs(url, arraysForced) {
	var m = url.match(/\?(.*)$/);
	if (m) {
		var args = {};
		var argStrs = m[1].split(/&/);
		for (var i in argStrs) {
			var argSpec = argStrs[i].split(/=/);
			var argName = argSpec[0];
			var val = unescape(argSpec[1]);
			if (typeof(arraysForced[argName])=="undefined" && typeof(args[argName])=="undefined") {
				args[argName] = val;
			}
			else {
				if (typeof(args[argName])!="object") {
					args[argName] = [];
				}
				args[argName][args[argName].length] = val;
			}
		}
		return args;
	}
	return false;
}

function modalMessage(msg, title) {
	var divEl = document.createElement("div");
	divEl.id = "modalMessage";
	divEl.innerHTML = msg;
	document.body.appendChild(divEl);
	hideSelectObjects(divEl, '');
}

function getPageHeight() {
	var h1 = isNaN(document.body.offsetHeight) ? 0 : document.body.offsetHeight;
	var h2 = isNaN(document.body.scrollHeight) ? 0 : document.body.scrollHeight;
	var h3 = isNaN(document.body.parentNode.scrollHeight) ? 0 : document.body.parentNode.scrollHeight;
	var h4 = document.documentElement ? document.documentElement.clientHeight : 0;
	return Math.max(h1,h2,h3,h4);
}

function showModalBackground(el) {
	var div = document.createElement("div");
	div.id = "modalBackdrop";
	div.style.height = getPageHeight()+"px";
	document.body.appendChild(div);
	hideSelectObjects(div, null, el);
}

function dismissModalBackground() {
	showSelectObjects(gbid("modalBackdrop"));
	document.body.removeChild(gbid("modalBackdrop"));
}

if (typeof(jQuery)!=="undefined") {
jQuery.event.special.touchstart = {
    setup: function( _, ns, handle ) {
        this.addEventListener("touchstart", handle, { passive: false });
    }
};
jQuery.event.special.touchmove = {
    setup: function( _, ns, handle ) {
        this.addEventListener("touchmove", handle, { passive: false });
    }
};
}

/** Pops up a HTML dialog, can be modal **/
/*function popupDialog(msg, width, modal, toFocus) {
	if (typeof(width)=="object" && width != null) { opts = width; width = null; }
	else { opts = {}; }
	var dlg = document.createElement("div");
	dlg.className = "dialog";
	dlg.id = opts.id ? opts.id : "popupDialog";
	dlg.style.display = "block";
	dlg.style.width = width;
	dlg.innerHTML = msg;
	document.body.appendChild(dlg);
	dlg.style.left = opts.left ? opts.left+"px"
		: (getScrollLeft()+getInnerWindowWidth()-getElWidth(dlg))/2+"px";
	dlg.style.top = opts.top ? opts.top+"px"
		: (getScrollTop()+(getInnerWindowHeight()-getElHeight(dlg))/2)+"px";
	if (modal) {
		showModalBackground(dlg);
	}
	if (toFocus) {
		gbid(toFocus).focus();
	}
}

function dismissDialog(id) {
	if (!id) { id = "popupDialog"; }
	if (gbid(id)) {
		showSelectObjects(gbid(id));
		document.body.removeChild(gbid(id));
	}
	if (gbid("modalBackdrop")) {
		dismissModalBackground();
	}
}*/

function labelClick(label) {
	var forText = label.getAttribute("for");
	if (!forText) { forText = label.getAttribute("htmlFor"); }
	if (!label.form.toRestore) {
		clearForm(label.form, label.form[forText], true);
		label.form.toRestore = true;
	}
	else {
		restoreForm(label.form, label.form[forText]);
		label.form.toRestore = false;
	}
}

function inspectObj(obj) {
	var str = typeof(obj)+" {";
	for (var i in obj) {
		str += i+":"+obj[i];
	}
	for (var i=0; i<obj.length; i++) {
		str += i+":"+obj[i];
	}
	str += "}";
	return str;
}

function handleSaveForm(formName, exec) {
	handleSaveForm_exec = exec;
	handleSaveForm_formName = formName;
	window.onkeypress = function(event) {
		event = geo(event);
		if ((event.altKey || event.ctrlKey) && ((event.which | 32)==115 || (event.keyCode | 32)==115) ) {
			if (handleSaveForm_exec) {
				handleSaveForm_exec();
			}
			else {
				document.forms[handleSaveForm_formName].onsubmit();
			}
			document.forms[handleSaveForm_formName].submit();
			event.stopPropagation();
			event.preventBubble();
			event.preventDefault();
		}
		return true;
	}
}

function arraySearch(needle, arr) {
	if (typeof(arr)=="string") return arr.search(needle);
	for (var i=0; i<arr.length; i++) {
		if (arr[i]==needle) {
			return i;
		}
	}
	return -1;
}

function getLabelForId(id) {
	var label;
	var labels = document.getElementsByTagName('label');

	for (var i = 0; (label = labels[i]); i++) {
		if (label.htmlFor == id) {
			return label;
		}
	}

	return false;
}

function selectMenuChanged(sel) {
	var o = sel.options[sel.selectedIndex];
	sel.selectedIndex = 0;
	if (o.getAttribute("href")) {
		window.location.href = o.getAttribute("href");
	}
	else if (o.getAttribute("js")) {
		eval(o.getAttribute("js"));
	}
}

function radioSelectLabel(rb) {
	rb.checked = true;
	var radioButtons = rb.form[rb.name];
	for (var i=0; i<radioButtons.length; i++) {
		var label = document.getElementById(rb.name + radioButtons[i].value + "Label");
		removeClassName(label, 'radioLabelSelected');
	}
	var selectedLabel = document.getElementById(rb.name + rb.value + "Label");
	addClassName(selectedLabel, 'radioLabelSelected');
}

function switchAccountOpenType(joinType) {
	if (joinType==1) {
		gbid("createAccount").style.display = "none";
		gbid("weblogin").style.display = DISPLAYTABLE;
	}
	else {
		gbid("createAccount").style.display = DISPLAYTABLE;
		gbid("weblogin").style.display = "none";
	}
}

function openerOpen(loc) {
	if (window.opener && !window.opener.closed) {
		window.opener.location.href = loc;
		window.opener.focus();
	}
	else {
		window.location.href = loc;
	}
}

///Very basic. Could only prevent simple auto harvesting.
function ds(v) {
	for (i=0; i<v.length; i++) {
		if (v.charCodeAt(i)<48) {
			document.write(v.charAt(i));
		}
		else if (i>0) {
			var p = v.charCodeAt(i-1) % 11;
			var c = v.charCodeAt(i);
			document.write(String.fromCharCode(c + p));
		}
		else {
			document.write(v.charAt(i));
		}
	}
}

function pausecomp(Amount) {
	var d = new Date(); //today's date
	var mill;
	var diff;

	while (1) {
		mill = new Date(); // Date Now
		diff = mill-d; //difference in milliseconds
		if( diff > Amount ) {break;}
	}
}

///Global variable (shudder)
var httpr;

/**
Check if the browser knows how to be dynamic
*/
function checkHttpRequest() {
	if (typeof(XMLHttpRequest)!="undefined") {
		return true;
	}
	else {
		/*@cc_on @*/
		/*@if (@_jscript_version >= 5)
		// JScript gives us Conditional compilation, we can cope with old IE versions.
		// and security blocked creation of the objects.
		 try {
		  new ActiveXObject("Msxml2.XMLHTTP");
		  return true;
		 } catch (e) {
		  try {
		   new ActiveXObject("Microsoft.XMLHTTP");
		   return true;
		  } catch (E) {
		   return false;
		  }
		 }
		@end @*/
	}
	return false;
}

function createHttpRequest() {
	var httpr = null;
	if (typeof(XMLHttpRequest)!="undefined") {
		httpr = new XMLHttpRequest();
	}
	else {
		/*@cc_on @*/
		/*@if (@_jscript_version >= 5)
		// JScript gives us Conditional compilation, we can cope with old IE versions.
		// and security blocked creation of the objects.
		 try {
			httpr = new ActiveXObject("Msxml2.XMLHTTP");
		 } catch (e) {
			try {
			 httpr = new ActiveXObject("Microsoft.XMLHTTP");
			} catch (E) {
			 httpr = false;
			}
		 }
		@end @*/
	}
	var httprWrapper = {rawHttpr: httpr};
	httprWrapper.abort = function() { this.rawHttpr.abort(); };
	httprWrapper.getLivePage = function(loc, callback, properties) {
		getLivePage(loc, callback, properties, {httpr: this.rawHttpr});
	};
	return httprWrapper;
}

/**
callback: takes httpr as an argument (which is possible due to the niceties of closures)
httpr.responseText contains text
httpr.readyState = 4 means response was valid
*/
getLivePage_count = 0;
function getLivePage(loc, callback, properties, options) {
	/// If caller hasn't passed an httpr, create a new localised one
	var httpr = null;
	if (!options || !options.httpr)
		{ httpr = createHttpRequest().rawHttpr; }
	else
		{ httpr = options.httpr; }
	if (properties) {
		for (var p in properties) {
			httpr[p] = properties[p];
		}
	}
	if (loc.match(/^jseval:/)) {
		loc = loc.replace(/^jseval:/, '');
		httpr.open("GET", loc);
		/// Load the arguments as variables in the local stack
		var args = {};
		if ( found=loc.match(/\?(.*)$/) ) {
			var argSpecs = found[1].split('&');
			for (var i in argSpecs) {
				var argSpec = argSpecs[i].split('=');
				var value = unescape(argSpec[1]);
				args[unescape(argSpec[0])] = value;
			}
		}
		httpr.onreadystatechange = function() {
			if (httpr.readyState==4) {
				/// Evaluate in the global context, but with arguments in the local stack
				/// Create faux httpr and set responseText = return value
				var newHttpr = {readyState: 4, responseText: null};
				function getArgs(args, givenArgs) {
					if (!givenArgs) { givenArgs = {}; }
					for (var i in givenArgs) { args[i] = givenArgs[i]; }
					return args;
				}
				newHttpr.responseText = window.eval(httpr.responseText);
				callback(newHttpr);
			}
		}
	}
	else {
		httpr.open("GET", loc);
		if (!document.all) { httpr.loc = loc; }
		getLivePage_count++;
		/// This causes a leak in IE, I believe
		httpr.onreadystatechange = function() {
			callback(httpr);
			if (httpr.readyState==4) { getLivePage_count--; }
		}
	}
	httpr.send(null);
}

function postAndGetLivePage(loc, postData, callback) {
	if (typeof(XMLHttpRequest)!="undefined") {
		httpr = new XMLHttpRequest();
	}
	else {
		/*@cc_on @*/
		/*@if (@_jscript_version >= 5)
		// JScript gives us Conditional compilation, we can cope with old IE versions.
		// and security blocked creation of the objects.
		 try {
		  httpr = new ActiveXObject("Msxml2.XMLHTTP");
		 } catch (e) {
		  try {
		   httpr = new ActiveXObject("Microsoft.XMLHTTP");
		  } catch (E) {
		   httpr = false;
		  }
		 }
		@end @*/
	}
	var dataToSend = "";
	var first = true;
	for (var i in postData) {
		if (first) { first = false; } else { dataToSend += "&"; }
		dataToSend += i +"="+ escape(postData[i]);
	}
	httpr.open("POST", loc);
	httpr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
	httpr.onreadystatechange = callback;
	httpr.send(dataToSend);
}

function getArrayFromEncoded(enc) {
	var arrSplit = enc.split(/&/);
	var arr = {};
	for (var i in arrSplit) {
		var kv = arrSplit[i].split(/=/);
		arr[kv[0]] = typeof(kv[1])=="undefined" ? "" : unescape(kv[1]);
		//alert(arr[kv[0]]);
	}
	return arr;
}

/**
Match a single expression. The expression to be matched should
be indicated in the tag by ().
tag - the re pattern
num - which () expression to match (1 is the first)
returns: the matched expression, or the empty string
*/
String.prototype.matchSingle = function(tag, num) {
	if (!num) { num = 1; }
	var found = this.match(tag);
	if (found) {
		return found[num];
	}
	return "";
}

/**
Match and dump returned into 'results'. Makes 'if (...)' nicer.
tag - the re pattern
results - an array which will hold results
returns: true if there's a match, false otherwise
*/
String.prototype.matchin = function(tag, results) {
	results.length = 0;
	if ( (m = this.match(tag)) ) {
		for (var i in m) {
			results[i] = m[i];
		}
		return true;
	}
	return false;
}

RegExp.escape = function(text) {
	return text.replace(/([.*+?^${}()|[\]\/\\])/g, '\\$1');
}

function trimWs(str) {
	return str.replace(/^\s*|\s*$/g, '');
}

function cleanHtmlText(str) {
	str = str.replace(
			/<font[^>]*>|<\/font>|<span[^>]*>|<\/span>|<p[^>]*><\/p>|<div[^>]*><\/div>|<.xml[^>]*>|<\/?\w*:[^>]*>|class=MsoNormal/gi,
		"");
	str = str.replace(/(<div>|<p[^>]*>)(&nbsp;)*/gi, "$1");
	str = str.replace(/<p[^>]*><\/p>|<div[^>]*><\/div>/gi, "");
	str = str.replace(/<(p|div)[^>]*>/gi, "<$1>");
	return str;
}

function cleanFckEditor(id) {
	var ed = FCKeditorAPI.GetInstance(id);
	ed.SetHTML(cleanHtmlText(ed.GetHTML()));
}

function fixIESelectInnerHTML(sel, innerhtml) {
	///Workaround IE bug;
	if (innerhtml && sel.options.length==0) {
		var div = document.createElement("div");
		div.innerHTML = '<select>'+innerhtml+'</select>';
		var newSel = div.firstChild;
		removeAllOptions(sel);
		for (var i=0; i<newSel.options.length; i++) {
			sel.options[i] = new Option(newSel.options[i].text, newSel.options[i].value);

			if (typeof(adjustCallback)!="undefined") { adjustCallback(sel.options, i); }
		}
	}
}

/**
Used from Table_LiveSelect
*/
var currentSel = null;
var currentSelValue = null;
function liveSelect_fieldEdit(dt, tr, livePage, field, linkedFields) {
	var args = "";
	if (linkedFields) {
		for (var i in linkedFields) {
			if (isNaN(i)) {
				args += linkedFields[i] +"="+ escape(dt.getTrValue(tr.rowIndex, i))+"&";
			}
			else {
				args += linkedFields[i] +"="+ escape(dt.getTrValue(tr.rowIndex, linkedFields[i]))+"&";
			}
		}
	}
	args += field +"="+escape(dt.getTrValue(tr.rowIndex, field));
	var sel = dt.getFieldHandler(field).selectControl;
	currentSel = sel;
	currentSelValue = sel.value;
	sel.options[sel.options.length] = new Option("Loading...","Loading...");
	sel.value = "Loading...";
	function liveSelect_fieldEdit_Update(httpr) {
		if (httpr.readyState==4) {
			var currentVal = currentSelValue;
			currentSel.innerHTML = httpr.responseText;
			fixIESelectInnerHTML(currentSel, httpr.responseText);
			currentSel.value = currentVal;
		}
	}
	getLivePage((livePage.search(/\?/)==-1 ? livePage+"?" : livePage+"&")+args, liveSelect_fieldEdit_Update);/**/
}

/**
Inserting a tab in textarea. From:
http://www.webdeveloper.com/forum/showthread.php?s=&threadid=32317
*/
function setSelectionRange(input, selectionStart, selectionEnd) {
  if (input.setSelectionRange) {
    input.focus();
    input.setSelectionRange(selectionStart, selectionEnd);
  }
  else if (input.createTextRange) {
    var range = input.createTextRange();
    range.collapse(true);
    range.moveEnd('character', selectionEnd);
    range.moveStart('character', selectionStart);
    range.select();
  }
}

function replaceSelection (input, replaceString) {
	if (input.setSelectionRange) {
		var selectionStart = input.selectionStart;
		var selectionEnd = input.selectionEnd;
		input.value = input.value.substring(0, selectionStart)+ replaceString + input.value.substring(selectionEnd);

		if (selectionStart != selectionEnd){
			setSelectionRange(input, selectionStart, selectionStart + 	replaceString.length);
		}else{
			setSelectionRange(input, selectionStart + replaceString.length, selectionStart + replaceString.length);
		}

	}else if (document.selection) {
		var range = document.selection.createRange();

		if (range.parentElement() == input) {
			var isCollapsed = range.text == '';
			range.text = replaceString;

			 if (!isCollapsed)  {
				range.moveStart('character', -replaceString.length);
				range.select();
			}
		}
	}
}


// We are going to catch the TAB key so that we can use it, Hooray!
function catchTab(item,e){
	var origScrollTop = item.scrollTop;
	if(navigator.userAgent.match("Gecko")){
		c=e.which;
	}else{
		c=e.keyCode;
	}
	if(c==9){
		replaceSelection(item,String.fromCharCode(9));
		setTimeout("document.getElementById('"+item.id+"').focus(); document.getElementById('"+item.id+"').scrollTop = "+origScrollTop+";",0);
		return false;
	}

}

/** Taken and modified from json.org (2006-04-28) **/
var toJSONString = null;
(function () {
    var m = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        },
        s = {
            array: function (x) {
                var a = ['['], b, f, i, l = x.length, v;
                for (i = 0; i < l; i += 1) {
                    v = x[i];
                    f = s[typeof v];
                    if (f) {
                        v = f(v);
                        if (typeof v == 'string') {
                            if (b) {
                                a[a.length] = ',';
                            }
                            a[a.length] = v;
                            b = true;
                        }
                    }
                }
                a[a.length] = ']';
                return a.join('');
            },
            'boolean': function (x) {
                return String(x);
            },
            'null': function (x) {
                return "null";
            },
            number: function (x) {
                return isFinite(x) ? String(x) : 'null';
            },
            object: function (x) {
                if (x) {
                    if (x instanceof Array) {
                        return s.array(x);
                    }
                    var a = ['{'], b, f, i, v;
                    for (i in x) {
                        v = x[i];
                        f = s[typeof v];
                        if (f) {
                            v = f(v);
                            if (typeof v == 'string') {
                                if (b) {
                                    a[a.length] = ',';
                                }
                                a.push(s.string(i), ':', v);
                                b = true;
                            }
                        }
                    }
                    a[a.length] = '}';
                    return a.join('');
                }
                return 'null';
            },
            string: function (x) {
                if (/["\\\x00-\x1f]/.test(x)) {
                    x = x.replace(/([\x00-\x1f\\"])/g, function(a, b) {
                        var c = m[b];
                        if (c) {
                            return c;
                        }
                        c = b.charCodeAt();
                        return '\\u00' +
                            Math.floor(c / 16).toString(16) +
                            (c % 16).toString(16);
                    });
                }
                return '"' + x + '"';
            }
        };

    toJSONString = function (obj) {
      return s.object(obj);
    };
})();

/// 2008-07-09: Not safe
function parseJSON(str) {
    try {
        /*return !(/[^,:{}\[\]0-9.\-+Eaeflnr-u \n\r\t]/.test(
                str.replace(/"(\\.|[^"\\])*"/g, ''))) &&*/
        return eval('(' + str + ')');
    } catch (e) {
        return false;
    }
}/*"*/

//////////////////////////////////////////
///  Search Form Saving                ///
//////////////////////////////////////////

function searchFormToString(form) {
	var str = "";
	for (var fi=0; fi<form.elements.length; fi++) {
		if (str) { str += "&"; }
		str += form.elements[fi].name +"=";
		if (form.elements[fi].type=="checkbox") {
			str += form.elements[fi].checked;
		}
		else if (form.elements[fi].type=="select-multiple") {
			var sel = form.elements[fi];
			var valStr = "";
			for (var si=0; si<sel.options.length; si++) {
				if (sel.options[si].selected) {
					if (valStr) { valStr += ","; }
					valStr += escape(sel.options[si].value);
				}
			}
			str += valStr;
		}
		else {
			str += escape(form.elements[fi].value);
		}
	}
	return str;
}

function stringToSearchForm(form, str) {
	var fields = str.split('&');
	for (var fi in fields) {
		var m = fields[fi].match(/^([^=]+)=(.*)$/);
		if (m) {
			var name = m[1], value = m[2];
			if (form[name].type=="checkbox" || (form[name].length>1 && form[name][1].type=="checkbox")) {
				var cbox = form[name].type=="checkbox" ? form[name] : form[name][1];
				if (value=="true") {
					cbox.checked = true;
				}
				else if (value=="false") {
					cbox.checked = false;
				}
			}
			else if (form[name].type=="select-multiple") {
				var vals = value.split(",");
				var selVals = {}; for (var si in vals) { selVals[unescape(vals[si])] = true; }
				var sel = form[name];
				for (var si=0; si<sel.options.length; si++) {
					if (selVals[String(sel.options[si].value)]) {
						sel.options[si].selected = true;
					}
					else {
						sel.options[si].selected = false;
					}
				}
			}
			else {
				form[name].value = unescape(value);
			}
		}
	}
}

function isCrumbLocation(where) {
	return where.search(/^[-a-zA-Z0-9_.]+$/)!=-1;
}

function saveSearchForm(form, where, callback, name, forAll) {
	var saveStr = searchFormToString(form);
	if (isCrumbLocation(where)) {
		/// Cookie/crumb
		setCrumb(where+"."+crumbNameEscape(name), saveStr);
	}
	else {
		/// Otherwise, it's a URL
		getLivePage(where+escape(saveStr)+"&name="+escape(name)+"&ftype=save"+(forAll ? "ForAll" : ""), callback);
	}
}

function loadSearchForm(form, where, callback, name, forAll, sel) {
	if (isCrumbLocation(where)) {
		/// Cookie/crumb
		stringToSearchForm(form, getCrumb(where+"."+crumbNameEscape(name)));
	}
	else {
		/// Otherwise, it's a URL
		getLivePage(where+"&name="+escape(name)+"&ftype=load"+(forAll ? "ForAll" : ""), function(httpr) {
			stringToSearchForm(form, httpr.responseText);
			callback(httpr);
			if (sel) { sel.selectedIndex = 0; }
		});
	}
}

function deleteSavedSearch(where, callback, name, forAll) {
	if (isCrumbLocation(where)) {
		/// Cookie/crumb
		deleteCrumb(where+"."+crumbNameEscape(name));
	}
	else {
		/// Otherwise, it's a URL
		getLivePage(where+"&name="+escape(name)+"&ftype=delete"+(forAll ? "ForAll" : ""), callback);
	}
}

function crumbNameEscape(name) {
	return escape(name).replace(/-/g, '%2D').replace(/\./g, '%2E').replace(/%/g, '_');
}

function crumbNameUnescape(name) {
	return unescape(name.replace(/_/g, '%'));
}

var hfsArgs = {};
function handleFormSave(sel, where, selValue, callback) {
	sel.selectedIndex = 0;
	hfsArgs = {sel: sel, where: where, selValue: selValue, callback: callback};
	var whereBegin = isCrumbLocation(where) ? '.' : '&name=';
	if (selValue=="~~Save~Search") {
		var dStr = '<h2>Save Search</h2> \
			<div>What do you want to name the search?</div> \
			<div><input type="text" id="handleFormSave_name" value="" onkeydown="e=geo(event); if (e.keyCode==13) { return handleFormSave_Save(hfsArgs.sel, hfsArgs.where, hfsArgs.callback, this.value); }" /></div> \
			<div class="controls"><input type="button" value="Save" onclick="handleFormSave_Save(hfsArgs.sel, hfsArgs.where, hfsArgs.callback, gbid(\'handleFormSave_name\').value);" /> <input type="button" value="Cancel" onclick="dismissDialog()"/></div>';
		popupDialog(dStr, '20em', true, "handleFormSave_name");
	}
	else if (selValue=="~~Save~Search~All") {
		var dStr = '<h2>Save Search for All</h2> \
			<div>What do you want to name the search?</div> \
			<div><input type="text" id="handleFormSave_name" value="" onkeydown="e=geo(event); if (e.keyCode==13) { return handleFormSave_Save(hfsArgs.sel, hfsArgs.where, hfsArgs.callback, this.value); }" /></div> \
			<div class="controls"><input type="button" value="Save" onclick="handleFormSave_Save(hfsArgs.sel, hfsArgs.where, hfsArgs.callback, gbid(\'handleFormSave_name\').value, true);" /> <input type="button" value="Cancel" onclick="dismissDialog()"/></div>';
		popupDialog(dStr, '20em', true, "handleFormSave_name");
	}
	else if (selValue=="~~Delete~Search") {
		var dStr = '<h2>Delete Search</h2> \
			<div>Select the searches you want to delete.</div> \
			<div><select id="handleFormSave_names" multiple size="6">';
		for (var si=0; si<sel.options.length; si++) {
			if (sel.options[si].value.search(/^~~/)==-1 && sel.options[si].value.search(/^--/)==-1) {
				dStr += '<option value="'+sel.options[si].value+'">'+sel.options[si].text+'</option>';
			}
		}
		dStr += '</select></div> \
			<div class="controls"><input type="button" value="Delete" onclick="handleFormSave_Delete(hfsArgs.sel, hfsArgs.where, hfsArgs.callback, gbid(\'handleFormSave_names\'));" /> <input type="button" value="Cancel" onclick="dismissDialog()"/></div>';
		popupDialog(dStr, '20em', true);
	}
	else if (selValue=="~~Delete~Search~All") {
		var dStr = '<h2>Delete Search</h2> \
			<div>Select the searches you want to delete.</div> \
			<div><select id="handleFormSave_names" multiple size="6">';
		for (var si=0; si<sel.options.length; si++) {
			if (sel.options[si].value.search(/^~~/)==-1 && sel.options[si].value.search(/^--/)!=-1) {
				dStr += '<option value="'+sel.options[si].value+'">'+sel.options[si].text+'</option>';
			}
		}
		dStr += '</select></div> \
			<div class="controls"><input type="button" value="Delete" onclick="handleFormSave_Delete(hfsArgs.sel, hfsArgs.where, hfsArgs.callback, gbid(\'handleFormSave_names\'), true);" /> <input type="button" value="Cancel" onclick="dismissDialog()"/></div>';
		popupDialog(dStr, '20em', true);
	}
	else if (selValue.search(/^~~/)==-1) {
		var forAll = false;
		if (selValue.search(/^--/)!==-1) {
			selValue = selValue.replace(/^--/, '');
			forAll = true;
		}
		loadSearchForm(sel.form, where, callback, selValue, forAll, sel);
	}
}

function handleFormSave_Save(sel, where, callback, name, forAll) {
	var form = sel.form;
	for (var i=0; i<sel.options.length; i++) {
		if (sel.options[i].value==name) {
			if (!confirm("The name exists already. Overwrite?")) {
				return;
			}
		}
	}
	dismissDialog();
	saveSearchForm(form, where, callback, name, forAll);
	sel.options[sel.options.length] = new Option(name, name);
}

function handleFormSave_Delete(sel, where, callback, namesSel, forAll) {
	var startSaved = 0;
	for (var si=0; si<sel.options.length; si++) {
		if (sel.options[si].value.search(/^~~/)==-1) {
			startSaved = si;
			break;
		}
	}
	for (var si=0; si<namesSel.options.length; si++) {
		if (namesSel.options[si].selected) {
			var searchName = namesSel.options[si].value;
			if (searchName.search(/^--/)!=-1) {
				searchName = searchName.replace(/^--/, '');
			}
			else {
				continue;
			}
			deleteSavedSearch(where, callback, searchName, forAll);
			sel.options[si+startSaved] = null;
		}
	}
	dismissDialog();
}

function getScriptArgs() {
	var args = {};
	var latestEl = document; while (latestEl.lastChild) {latestEl = latestEl.lastChild;}
	if (elHasAttribute(latestEl, "args")) {
		args = latestEl.getAttribute("args");
		eval("args = {"+args+"};");
	}
	return args;
}

function addCssRule(selector, text) {
	var styleEl = gbid("_customCssRules");
	if (!styleEl) {
		styleEl = document.createElement('style');
		styleEl.id = "_customCssRules";
		document.getElementsByTagName("head")[0].appendChild(styleEl);
	}
	var ss = styleEl.styleSheet ? styleEl.styleSheet : styleEl.sheet;

	var cssRules = ss.rules ? ss.rules : ss.cssRules;

	if (cssRules) {
		for (var i=0; i<cssRules.length; i++) {
			console.log(cssRules[i].selectorText.toLowerCase(), selector.toLowerCase());
			if (cssRules[i].selectorText.toLowerCase() == selector.toLowerCase()) {
				if (ss.removeRule) {
					ss.removeRule(i); i--;
				}
				else if (ss.deleteRule) {
					ss.deleteRule(i); i--;
				}
			}
		}
	}
	if (ss.insertRule) {
		console.log(selector + '{' +text+ '}', cssRules.length);
		ss.insertRule(selector + '{' +text+ '}', cssRules.length);
	}
	else if (ss.addRule) {
		ss.addRule(selector, text);
	}
}

function nodeListToArray(nodeList) {
	var arr = [];
	for (var i=0; i<nodeList.length; i++) {
		arr[arr.length] = nodeList[i];
	}
	return arr;
}

/** specialChecks not yet implemented **/
function formHasRequired(parentEl, specialChecks, opts) {
	if (!opts) { opts = {}; }
	var missingLabels = getElementsByClass("missing", parentEl, "label");
	for (var i in missingLabels) { removeClassName(missingLabels[i], "missing"); }
	var reqs = getElementsByClass("required", parentEl);
	var hasRequired = true;
	for (var i=0; i<reqs.length; i++) {
		var formEls = nodeListToArray(reqs[i].getElementsByTagName("input")).concat(nodeListToArray(reqs[i].getElementsByTagName("select"))).concat(nodeListToArray(reqs[i].getElementsByTagName("textarea")));
		for (var j=0; j<formEls.length; j++) {
			if (!formEls[j].value) {
				if (!opts.checkOnly) {
					var labels = getContainer(formEls[j], "tr").getElementsByTagName("label");
					for (var k=0; k<labels.length; k++) {
						if (formEls[j].id == labels[k].htmlFor) {
							addClassName(labels[k], "missing");
							break;
						}
					}
					if (hasRequired) { formEls[j].focus(); }
				}
				hasRequired = false;
			}
		}
	}
	return hasRequired;
}

/*****************************/
/* Prepare page for printing */
/*****************************/
function getScreenDpi(unitType) {
	if (!unitType) { unitType = "in"; }
	document.body.appendChild(newEl('<div id="_screenDpiCheck" style="width: 1'+unitType+'; height: 1'+unitType+'; border: 0; position: absolute;"></div>'));
	var dpi = (gbid("_screenDpiCheck").offsetHeight+gbid("_screenDpiCheck").offsetWidth)/2;
	gbid("_screenDpiCheck").parentNode.removeChild(gbid("_screenDpiCheck"));
	return dpi;
}

/// For elements like td, p, div find the minimum top of all elements whose bottoms appear
/// after the threshold. Elements should not include things like table or divs that contain
/// other divs, unless they were absolutely positioned, blah blah blah...
function preparePageForPrinting() {
	var printArea = "21x27";
	var pxPerCm = getScreenDpi("cm");
	//prompt("Printable area in centimetres? (width x height)");
	var m;
	if ( m=printArea.match(/\s*(\d+)\s*x\s*(\d+)\s*/, printArea) ) {
		printArea = {width: m[1]*pxPerCm, height: m[2]*pxPerCm};
	}
	console.log("printArea", printArea);
	var allEls = document.getElementsByTagName('*');
	console.log("allEls.length", allEls.length);
	var pageI = 0;
	var minTop = 10000000;
	var minEl = null;
	for (var i=0; i<allEls.length; i++) {
		/// Skip tables (should skip other things too...)
		if (allEls[i].tagName.search(/TABLE|HTML|BODY/)!=-1) { continue; }
		//console.log(i, getElTop(allEls[i]));
		if (allEls[i].offsetWidth!=0 && allEls[i].offsetHeight!=0) {
			var threshHeight = (pageI+1)*printArea.height;
			//console.log("elTop:",getElTop(allEls[i]),"threshHeight:",threshHeight);
			if (getElBottom(allEls[i]) > threshHeight) {
				var elTop = getElTop(allEls[i]);
				if (elTop < minTop) {
					minTop = elTop;
					minEl = allEls[i];
				}
				//console.log("threshExceeded", allEls[i]);
				/// Find the top most parent
			}
		}
	}
	console.log(minEl);
}

function tableToCsv(table, opts) {
	function htmlToString(str) {
		str = str.replace(/\n*<br>\n*/gi,"\n");
		str = str.replace(/&quot;/g, '"');
		str = str.replace(/&nbsp;/g, ' ');
		str = str.replace(/&gt;/g, ">");
		str = str.replace(/&lt;/g, "<");
		str = str.replace(/&amp;/g, "&");
		return str;
	}
	if (!opts) { opts = {}; }
	var csv = "";
	for (var r=0; r<table.rows.length; r++) {
		for (var c=0; c<table.rows[r].cells.length; c++) {
			if (c!=0) { csv += ","; }
			var val = table.rows[r].cells[c].innerHTML;
			if (opts.plainText) {
				val = htmlToString(val).replace(/<[^>]+>/g,"");
			}
			csv += '"'+val.replace(/"/g, '""')+'"';
		}
		csv += "\n";
	}
	if (opts.asDownload) {
		dataUrl = "data:text/csv,"+escape(csv);
		window.location.href = dataUrl;
		return;
	}
	return csv;
}

function getQs() {
	var params = {};
	var argSpecs = window.location.search.substring(1).split('&');
	for (var i in argSpecs) {
		var argInfo = argSpecs[i].split('=');
		params[unescape(argInfo[0])] = unescape(argInfo[1]);
	}
	return params;
}

if (typeof(exports)!='undefined') {
	Object.assign(exports, {
		counters,
	});
}