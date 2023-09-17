(function(exports) {
/**
OM = object model.

 Example syntax for rules:

 BASE = /\d+/ /\s+/ /\d+/

 would parse:

 75 54

 and so would:

 BASE = NUM /\s+/ NUM
 NUM = /\d+/

 (but produce a different object model).
*/

/// Debug functions
var nullConsole = {
	log: function(){}, warn: function(){}, trace: function(){}, info: function(){},
};
var debug = nullConsole;

function parsing_debug(on) {
	if (on) {
		debug = console;
	}
	else {
		debug = nullConsole;
	}
}

/*Cute, but not cross-browser...
function debugOutFunc(...args) {
	var err = null;
	try { throw Error('') } catch(_err) { err = _err; }

	var stack = err.stack.split(/\n/);
	var frameParts = stack[1].match(/^([^@]*).*\/([^\/:]*):([^:]*):([^:]*)$/);
	var locStr = frameParts[2]+":"+frameParts[3]+":"+frameParts[4];

	console.log('%c%s%c', 'color: blue', locStr, '', ...args);
}*/

function RuleItem(o) {
	this.rulename = null;
	this.orOperator = null;
	this.store = null;
	this.operators = [];

	for (var i in o) {
		this[i] = o[i];
	}
}

/**
 Create a single rule. Parses the rule in 'str', not including '<name> = '.
*/
function Rule(name, str, grammar, isShadowRule) {
	this.name = name;
	this.grammar = grammar; ///The grammar this rule belongs to
	this.ruleList = [];
	this.isOrRule = false;
	this.isShadowRule = isShadowRule;
	this.isMainRule = false;
	this.parseRuleString(str);
}
Rule.prototype = {
	parseRuleString: function(str) {
		this.str = str;
		var test = 0;
		/// Loop through each token in the string
		while (++test < 500) {

			var token = this.getNextToken();

			if (token.eof) { break; }
			if (token.undef) {
				if (token.notoken) { alert("Undef Error"); }
				if (token.blank) { alert("Empty Error"); }
				break;
			}
			if (token.rulename) {
				this.ruleList.push(new RuleItem({rulename: token.value}));
			}
			else if (token.orOperator) {
				this.isOrRule = true;
				this.ruleList.push(new RuleItem({orOperator: true}));
			}
			else if (token.startArgs) {
				var args = this.getArgs(token.value);
				this.ruleList[this.ruleList.length-1].args = args;
			}
			else if (token.operator) {
				var rule = this.ruleList[this.ruleList.length-1];
				if (!rule.operators)  rule.operators = {};
				rule.operators[token.value] = true;
			}
			/// /CSV/ROW[0]/COLS/C1
			else if (token.literaldelim) {
				var val = this.getLiteral(token.value);
				this.ruleList.push(new RuleItem({literal: val}));
			}
			else if (token.store) {
				this.ruleList[this.ruleList.length-1].store = token.value;
			}
		}
		if (test >= 500) { alert('Loop limit reached'); }
	},
	getNextToken: function() {
		var token = null;
		var strlen = this.str.length;
		var res = [];
		debug.log("A:["+this.str+"]");
		/** rulenames **/
		if (this.str.matchin( /^(\w+)/, res)) {
			var matched = res[1];
			debug.log("X:["+matched+"]");
			this.str = this.str.substr(matched.length);
			token = {rulename: true, value: matched};
		}
		/** unary operators **/
		/* +, * and ? have standard meanings. ! @ have special
		  meanings, that shadow out (or in) things from the
		  object model */
		else if (this.str.matchin( /^([+*?!@])/, res)) {
			var matched = res[1];
			debug.log("Y:["+matched+"]");
			this.str = this.str.substr(matched.length);
			token = {operator: true, value: matched};
		}
		/** arguments **/
		else if (this.str.matchin( /^(\()/, res)) {
			var matched = res[1];
			debug.log("Y:["+matched+"]");
			this.str = this.str.substr(matched.length);
			token = {startArgs: true, value: matched};
		}
		/** OR OPERATOR's **/
		else if (this.str.matchin( /^([|])/, res)) {
			var matched = res[1];
			debug.log("OR:["+matched+"]");
			this.str = this.str.substr(matched.length);
			token = {orOperator: true, value: matched};
		}
		/** STORES (NOW CALLED CLASSES) **/
		else if (this.str.matchin( /^(\.\s*)(\w+)/, res)) {
			var matched = res[2];
			debug.log("STORE:["+matched+"]");
			this.str = this.str.substr(res[0].length);
			token = {store: true, value: matched};
		}
		/** WHITESPACE **/
		else if (this.str.matchin( /^(\s+)/, res)) {
			var matched = res[1];
			debug.log("Z:["+matched+"]");
			this.str = this.str.substr(matched.length);
			token = {whitespace: true, value: matched};
		}
		/** REGEXP QUOTES **/
		else if (this.str.matchin( /^(\/)/, res)) {
			var matched = res[1];
			this.str = this.str.substr(matched.length);
			token = {literaldelim: true, value: matched};
		}
		/** EOF **/
		else if (this.str.matchin( /^\s*$/, res)) {
			debug.log("EOF");
			token = {eof: true};
			return token;
		}
		/** If couldn't find token, or token is empty **/
		if (!token) return {undef: true, notoken: true};
		if (strlen == this.str.length) return {undef: true, blank: true};

		return token;
	},
	S_NORMAL: 0,
	S_ESCAPE: 1,
	getLiteral: function(delim) {
		debug.log("L:["+this.str+"]");
		var res = [];
		var state = this.S_NORMAL;
		var atEnd = false;
		for (var ci=0; ci<this.str.length; ci++) {
			switch (this.str.charAt(ci)) {
				case "\\":
					if (state==this.S_NORMAL) {
						state = this.S_ESCAPE;
					}
					else {
						state = this.S_NORMAL;
					}
					break;
				case delim:
					if (state==this.S_NORMAL) {
						atEnd = true;
						break;
					}
					else if (state==this.S_ESCAPE) {
						state = this.S_NORMAL;
					}
					break;
				default:
					if (state==this.S_ESCAPE) {
						state = this.S_NORMAL;
					}
					//Keep going
					break;
			}
			if (atEnd) {
				var lit = this.str.substr(0, ci);
				this.str = this.str.substr(ci+1);
				debug.log("LIT:["+lit+"]");
				return lit;
			}
		}
		return false;
	},
	getArgs: function(par) {
		var args = [];
		var atEnd = false;
		debug.log("getArgs:["+this.str+"]");
		for (var ci=0; ci<this.str.length; ci++) {
			switch (this.str.charAt(ci)) {
				case "'":
					this.str = this.str.substr(ci+1);
					var lit = this.getLiteral("'");
					ci = -1;
					args.push(lit);
					break;
				case ")":
					atEnd = true;
					break;
			}
			if (atEnd) {
				this.str = this.str.substr(ci+1);
				debug.log("LINK:["+args.join("|")+"]");
				return args;
			}
		}
	}
};

function Grammar(str) {
	this.rules = [];
	this.parseGrammar(str);
}
Grammar.prototype = {
	/** Parses a grammar (for translation, this is either a source or destination grammar).

	    GRAMMAR = LINE*
	    LINE = RULE | BLANK
	**/
	parseGrammar: function(str) {
		debug.log("%cparseGrammar()", 'color: green; font-weight: bold;');
		/// Strip surrounding whitespace
		str = str.replace(/^\s*|\s*$/gm, '');
		var lines = str.split(/\n/);
		this.rules = {};
		for (var i in lines) {
			/* Match something like:
				RULENAME  =  .*
				RULENAME! =  .*           (shadow rule)
				RULENAME  =  .* | .*      (or rule)
			*/
			var m = lines[i].match(/^(\w+?)(!?)\s*=\s*(.*)$/);
			if (m) {
				var isShadowRule = (m[2]=='!');
				this.rules[m[1]] = new Rule(m[1], m[3], this, isShadowRule);

				debug.log(m[1]);
				debug.log(this.rules);

				/// If this is the first line, it's the root rule
				if (i==0) {
					this.mainRule = this.rules[m[1]];
					this.mainRule.isMainRule = true;
					debug.log(this.mainRule);
				}
			}
		}
		debug.log("%cparseGrammar() complete", 'color: green; font-weight: bold;');
	},
	createTree: function(str) {
		debug.log("createTree()");
		this.input = str;
		this.inputStack = [];
		this.terminatorStack = ['$'];
		this.stackTerminator = false;
		var om = this.applyRule(this.mainRule);
		debug.log("createTree() complete");
		return om;
	},
	applyRule: function(rule) {
		var store = {type: rule.name, children: []};
		var orSuccessful = false;
		var hoistedObject = null;
		var hoistedChildren = [];
		var ruleFailed = false;
		var skipToNextOrClause = false;

		//this.inputStack.push(this.input);
		var savedInput = this.input;

		debug.log("Applying", rule.name, "on input {{{{{", this.input, "}}}}}", this.inputStack);
		for (var i=0; i<rule.ruleList.length; i++) {
			var rulePartStr = "Rule:"+rule.name+": Part("+i+")";
			//debug.log("STARTING "+rulePartStr);
			//debug.log("INPUT:", this.input);
			//if (i>0) break;
			var ruleItem = rule.ruleList[i];
			if (ruleItem.orOperator) {
				/// If we're not trying to skip to next or clause
				/// then we've done a successful match
				if (!skipToNextOrClause) {
					break;
				}
				/// Otherwise, we need to backtrack to where we were at the start of the or rule
				else {
					skipToNextOrClause = false;
					//this.input = this.inputStack[this.inputStack.length-1];
					this.input = savedInput;
					store.children = [];
					hoistedChildren = [];
				}
			}
			else if (skipToNextOrClause) {
				/// Do nothing for this rule item
			}
			else if (ruleItem.literal) {
				//debug.log("Doing LITERAL in "+rulePartStr);
				debug.log("Applying LITERAL", ruleItem.literal, " on input", this.input);
				var val = this.applyLiteral(ruleItem);
				if (val===false) {
					if (ruleItem.operators['?']) {
						/// If failed to match literal, input won't be changed,
						/// so no need to do anything
					}
					else {
						if (rule.isOrRule) {
							skipToNextOrClause = true;
							debug.log('Continuing or rule from literal: '+rulePartStr);
							continue;
						}
						debug.log('litret');
						ruleFailed = true;
						break;
					}
				}
				else {
					/// Don't store if encounter ! operator
					debug.log("XXX:", ruleItem);
					if (!ruleItem.operators['!']) {
						debug.log("storing:", ruleItem);
						store.children.push(val);
						if (ruleItem.store)  store["class"] = ruleItem.store;
						if (rule.isShadowRule && ruleItem.operators['@']) {
							hoistedObject = val;
						}
					}
				}
			}
			else if (ruleItem.rulename) {
				//debug.log("Doing RULENAME in "+rulePartStr);
				var val = [];
				var test = 0;
				var continueOr = false;
				var isLoop = (ruleItem.operators['*']);
				while (++test < 1000) {
					if (ruleItem.args && typeof(ruleItem.args[0])!=undefined
							&& this.input.search(new RegExp('^'+ruleItem.args[0]))!=-1 ) {
						break;
					}
					//debug.log('Doing '+ruleItem.rulename+(isLoop?' Loop':' Rule')+' in '+rulePartStr);
					var inputLength = this.input.length;
					var v = this.applyRule(this.rules[ruleItem.rulename]);
					//debug.log('Applied rule', this.rules[ruleItem.rulename], 'Result:', v);
					/// Stop looping if we failed to match *OR* we get match of 0 length (which would
					/// otherwise produce an infinite loop)
					if (v===false || inputLength == this.input.length) {
						if (isLoop) {
							break;
						}
					}
					/// Break if we fail to match in one section of an or rule,
					/// and try the next section instead
					if (v===false && rule.isOrRule && !ruleItem.operators['?']) {
						debug.log('Continuing or rule from rulecall: '+rulePartStr);
						skipToNextOrClause = true;
						break;
					}
					/// Return false or (if root) throw exception if we fail to match, and the match wasn't optional
					if (v===false) {
						if (!ruleItem.operators['?']) {
							if (!rule.isMainRule) {
								ruleFailed = true;
								break;
							}
							else {
								function replMaker() {
									var cache = [];
									return function(key, value) {
										if (typeof value === 'object' && value !== null) {
											if (cache.indexOf(value) !== -1) {
												// Circular reference found, discard key
												return;
											}
											// Store value in our collection
											cache.push(value);
										}
										return value;
									}
								}
								var str = "Grammar was not able to match the input data. Rule:"+JSON.stringify(rule,replMaker())+", Rule Item:"+JSON.stringify(ruleItem,replMaker());
								throw str;
							}
						}
					}
					else if (!v.isShadowRule) {
						val.push(v);
					}

					/// Do the above only once, unless we have a loop operator
					if (!ruleItem.operators['*']) {
						break;
					}
				}
				if (test >= 1000) {
					console.log("loop limit exceeded");
				}
				if (skipToNextOrClause) {  continue;  }
				if (!ruleItem.operators['*']) {
					/// May be undefined (if from a shadow rule)
					val = val[0];
					if (ruleItem.store)  val["class"] = ruleItem.store;
				}
				else {
					if (ruleItem.store) {
						for (var i=0; i<val.length; i++) {
							val[i]["class"] = ruleItem.store;
						}
					}
				}
				if (!ruleItem.operators["!"]) {
					/// Will be undefined if from a shadow rule
					if (val!==undefined)  store.children.push(val);
				}
			}
			if (ruleItem.operators["@"]) {
				if (rule.isShadowRule) {
					hoistedObject = val;
				}
				else {
					if (ruleItem.operators['!']) {
						hoistedChildren = hoistedChildren.concat(val.children);
					}
					else {
						hoistedChildren.push(val);
					}
				}
			}
		}
		/// We always pop the inputStack to remove state we no longer
		/// need to track
		/// However, if the rule failed, we *also* need to reset
		/// the input to the last valid input
		debug.log(this.inputStack);
		if (ruleFailed) {
			debug.log("rule", rule.name, "failed");
			this.input = savedInput; //this.inputStack[this.inputStack.length-1];
		}
		//this.inputStack.pop();
		if (hoistedChildren.length) {
			store.children = hoistedChildren;
		}
		if (rule.isShadowRule) {
			store.isShadowRule = true;
		}
		var ret = hoistedObject || (ruleFailed ? false : store);
		debug.log("Finished rule "+rule.name+". Returning:", ret);
		return ret;
	},
	applyLiteral: function(ruleItem) {
		var re = new RegExp('^(?:'+ruleItem.literal+')');
		var res = [];
		if (this.input.matchin(re, res)) {
			//debug.log("LIT:["+res[0]+"]");
			this.input = this.input.substr(res[0].length);
			//debug.log(" input:["+this.input+"]");
			return res[0];
		}
		///Returning false means the (conjunctive) rule failed
		///or the (disjunctive) condition failed, try next condition
		return false;
	},
	getFirstLiteral: function(ruleItem) {
		if (typeof(ruleItem.literal)!="undefined") {
			debug.log("xxx");
			return ruleItem;
		}
		else if (ruleItem.rulename=="STR") {
			console.log("ambiguous STR placement (may directly follow another STR)");
			return 'x';
		}
		else if (ruleItem.rulename) {
			return this.getFirstLiteral(this.rules[ruleItem.rulename].ruleList[0]);
		}
		else {
			console.log("getFirstLiteral Problem...");
			return 'x';
		}
	},
}

function joinv(sep, arr) {
	var str = "";
	debug.log(arr);
	if (typeof(arr.children)!="undefined") {
		debug.log('innervals');
		str += joinv(sep, arr.children);
	}
	else {
		for (var i in arr) {
			debug.log('el'+i);
			if (str) { str += sep; }
			if (typeof(arr[i])=="object") {
				str += joinv(sep, arr[i]);
			}
			else {
				str += arr[i];
			}
		}
	}
	return str;
}

function joinall(sep, arr) {
	var str = "";
	for (var i=0; i<arr.length; i++) {
		if (str) { str += sep; }
		if (typeof(arr[i])=="object") {
			str += joinall(sep, arr[i]);
		}
		else {
			str += arr[i];
		}
	}
	return str;
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

function matchObject(obj, criteria) {
	var objMatches = true;
	var toReturn = obj;

	/// Try to make a match against this object
	for (var cProp in criteria) {
		//onsole.log(cProp);
		if (cProp in obj) {
			var haveMatch = true;
			if (criteria[cProp] === OBJECTVALUE) {
				return obj[cProp];
			}
			else if (criteria[cProp].test) {
				haveMatch = criteria[cProp].test(obj[cProp]);
			}
			else if (typeof(criteria[cProp])=="object" && criteria[cProp]!==null) {
				var m = matchObject(obj[cProp],criteria[cProp]);
				haveMatch = m!==null;
				if (m !== obj[cProp]) {
					toReturn = m;
				}
			}
			else {
				haveMatch = obj[cProp] == criteria[cProp];
			}
			if (!haveMatch) {
				objMatches = false;
				break;
			}
		}
		else {
			objMatches = false;
			break;
		}
	}
	return objMatches ? toReturn : null;
}

/* Does not protect against cycles */
Object.defineProperty(Object.prototype, '_findObject', {value: function(criteria, o = {}) {
	o.recursive ??= true;
	/// Can't make it a quick dict, due to no unique id available :( (and I'm not generating them!)
	var objsEncountered = [];
	var maxLoops = 10000;
	var curI = 0;

	function doFind(obj) {
		if (curI++ > maxLoops) return null;
		if (objsEncountered.indexOf(obj)>=0)  return null;
		objsEncountered.push(obj);
		//onsole.log(...objsEncountered);
		var m = matchObject(obj, criteria);
		if ( m!==null ) {
			return m;
		}
		else {
			/// If can't match against this object, try any sub-objects recursively
			if (o.recursive)  for (var prop in obj) {
				try {
					if (typeof(obj[prop])=="object" && obj[prop]!==null) {
						var result = doFind(obj[prop]);
						if (result!==null)  return result;
					}
				}
				catch (e) {}
			}
		}
		return null;
	}
	return doFind(this);
}});

var OBJECTVALUE = {}; /// This essentially creates a unique value to match against

/* Does not protect against cycles */
Object.defineProperty(Object.prototype, '_findObjects', {value: function(criteria) {
	/// Can't make it a quick dict, due to no unique id available :( (and I'm not generating them!)
	var objsEncountered = [];
	var maxLoops = 10000;
	var curI = 0;

	var foundObjs = [];

	function doFind(obj) {
		if (curI++ > maxLoops) return null;
		if (objsEncountered.indexOf(obj)>=0)  return null;
		objsEncountered.push(obj);
		var m = matchObject(obj, criteria);
		//onsole.log(...objsEncountered);
		if ( m!==null ) {
			foundObjs.push(m);
		}
		/// Now check against all sub-objects recursively
		for (var prop in obj) {
			try {
				if (typeof(obj[prop])=="object" && obj[prop]!==null) {
					doFind(obj[prop]);
				}
			}
			catch (e) {}
		}
	}
	doFind(this);
	return foundObjs;
}});

exports.Grammar = Grammar;
exports.OBJECTVALUE = OBJECTVALUE;
})(typeof(exports)!="undefined"?exports:window);