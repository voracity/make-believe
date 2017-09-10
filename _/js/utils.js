/***
	XXX - I need to clean out this utils.js file. Lots of unnecessary stuff.
***/

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

class UndoChange {
	constructor() {
	
	}
}

/** 
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
	}
	
	/**
		|change| should be an object of the following form:
		
		{name: <name of change>, undo: <undo function>, redo: <redo function>}
	*/
	add(change) {
		if (!this.revisionInProgress) {
			this.list[this.index] = change;
			this.index++;
			/// Any new change, truncates the undo list
			this.list.length = this.index;
		}
	}
	
	addAndDo(change) {
		this.add(change);
		change.redo();
	}
	
	undo() {
		if (this.index > 0) {
			this.index--;
			this.revisionInProgress = true;
			try {
				this.list[this.index].undo();
			}
			finally {
				this.revisionInProgress = false;
			}
		}
	}
	
	redo() {
		if (this.index < this.list.length) {
			this.revisionInProgress = true;
			try {
				this.list[this.index].redo();
			}
			finally {
				this.revisionInProgress = false;
			}
			this.index++;
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

(function($, undefined) {
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

function changeQsUrl(url, nameValues) {
    url = url.replace(/^&|&$/g, "");
    found = url.match(/^([^?]*\??)(.*)/);
    if (found) {
    	if (found[1].charAt(found[1].length-1)!='?') {
    		found[1] += '?';
    	}
    	return found[1]+changeQs(nameValues, found[2]);
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
		qs += name + "=" + escape(nameValues[name]);
	}
	qs = qs.replace(/^&/, "");
	return qs;
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

/** Pops up a HTML dialog, can be modal **/
function popupDialog(msg, width, modal, toFocus) {
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
}

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