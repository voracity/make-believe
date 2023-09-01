(function(global) {
	let ISCHAIN = Symbol('ISCHAIN');
	let namespaces = {
		'svg': 'http://www.w3.org/2000/svg',
		/// s is a custom alias
		's': 'http://www.w3.org/2000/svg',
		'math': 'http://www.w3.org/1998/mathml',
		/// m is a custom alias
		'm': 'http://www.w3.org/1998/mathml',
	};
	function node(tag, ...args) {
		let nsParts = tag.split(/:/);
		let ns = null;
		if (nsParts.length>1) {
			ns = nsParts[0];
			tag = nsParts[1];
		}
		let parts = tag.split(/(?=[.#])/);
		tag = parts[0];
		let attrs = parts.slice(1);
		let el = ns ? document.createElementNS(namespaces[ns], tag) : document.createElement(tag);
		let attr = null;
		let arg = null;
		let i = 0;
		for (i=0; i<attrs.length; i++) {
			attr = attrs[i];
			if (attr[0] == '.')  el.classList.add(attr.slice(1));
			else if (attr[0] == '#')  el.id = attr.slice(1);
		}
		for (i=0; i<args.length; i++) {
			arg = args[i];
			handleArg(el, arg);
		}
		
		return el;
	}

	function qnode(tag, ...args) {
		let el = document.createElement(tag);

		for (i=0; i<args.length; i++) {
			arg = args[i];
			handleArg(el, arg);
		}

		return el;
	}

	function handleArg(el, arg) {
		let type = typeof arg;
		let containerEl = el;
		
		/// Blah to special casing :(
		/// This at least makes it work seamlessly with HTML
		if (el.tagName == 'TEMPLATE') {
			containerEl = el.content;
		}
		
		if (arg === null || arg === undefined) {
			/// pass
		}
		/// This is far quicker than instanceof, though more prone to error
		else if (arg.nodeType && arg.nodeName) {
		//else if (arg instanceof Element || arg instanceof DocumentFragment) {
			/// XXX: DOM doesn't like proxies 
			containerEl.appendChild(arg?.[ISCHAIN] ? arg.raw : arg);
		}
		else if (Array.isArray(arg)) {
			let args = arg;
			for (var arg of args) {
				handleArg(el, arg);
			}
		}
		else if (type == "string" || type == "number" || type == "boolean") {
			containerEl.appendChild(document.createTextNode(String(arg)));
		}
		else {
			for (var attr in arg) {
				var attrVal = arg[attr];
				if (attr in node.hooks)  node.hooks[attr](el, attrVal, attr);
				else if (attrVal===null) ;
				else {
					/// Convert mixedCase to mixed-case
					attr = attr.replace(/[A-Z]/g, m => '-'+m.toLowerCase());
					el.setAttribute(attr, String(attrVal));
				}
			}
		}
	}

	/// Attributes that do custom things. Recommend prefixing with 'hook'. JS style names only.
	node.hooks = new Proxy({},{
		get(target, prop, receiver) {
			if (prop.startsWith('on_')) {
				return (el,attrVal,attr) => node.hooks.on(el, {[attr.slice(3)]:attrVal});
			}
			return Reflect.get(...arguments);
		},
		has(target, prop) {
			if (prop.startsWith('on_')) {
				return true;
			}
			return prop in target;
		},
	});
	var n = node;

	/// A rather important hook
	node.hooks.on = (el, obj) => {
		for (var [eventName,func] of Object.entries(obj)) {
			el.addEventListener(eventName, func);
		}
	}

	node.hooks.dataText = (el, arg) => {
		el.appendChild(document.createTextNode(String(arg)));
	}

	/*function syncNode(target, source) {
		var nodesToSync = [target];
		
	}*/
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

	/** Call using html`<div>${content}</div>` or using html('<div>'+content+'</div>') **/
	function html(strs, ...keys) {
		if (strs && strs.nodeType !== undefined)  return strs;
		let str = typeof(strs)=="string" ? strs : strs[0] + keys.map((k,i) => toHtml(k)+strs[i+1]).join('');
		var wrapper = document.createElement('div');
		var range = document.createRange();
		wrapper.innerHTML = str;
		range.selectNodeContents(wrapper);
		return range.extractContents();
	}

	/** This restores jquery like chaining --- but for any object at all! **/
	function chain(o, opts = {}) {
		function chainPromise(prom, opts = {}, prevProp = null) {
			let dummy = function(){};
			let proxy = new Proxy(dummy, {
				get(target, prop) {
					if (prop == 'then') {
						/// If I have to call back await (or some other then() call's callback),
						/// return the promise immediately
						return r => r(prom);
					}
					//onsole.log(prop);
					/** Special case function to be a function that returns a promise, rather than promise **/
					return chainPromise(prom.then(v => chain(v, opts)[prop]), opts);
				},
				apply(target, thisArg, args) {
					return chainPromise(prom.then(v => v(...args)), opts);
				},
			});
			opts.root ??= proxy;
			return proxy;
		}

		let chainSym = Symbol('chain');
		if (typeof(o)!='object' || o == null || o[chainSym])  return o;
		let handler = {get(target,prop,receiver,noCustomProps) {
			if (!noCustomProps) {
				if (prop === 'my') {
					return new Proxy(proxy, {get(_target,_prop) {
						//onsole.log(target,_prop, prop);
						return handler.get(target,_prop,receiver,true);
					}});
				}
				else if (prop === 'root') {
					return opts.root;
				}
				else if (prop === 'rootNew') {
					opts.root = proxy;
					return proxy;
				}
				else if (prop === 'set') {
					/** return function to set things **/
					return (obj, o = {}) => {
						/// null/undefined
						if (o.null===false) {
							obj = Object.fromEntries(Object.entries(obj).filter(([k,v]) => v!=null));
						}
						Object.assign(target, obj);
						/// return the proxy
						return proxy;
					};
				}
				else if (prop === 'listeners') {
					if (!('htm_listeners' in target)) {
						if (target instanceof EventTarget) {
							target.htm_listeners = new DOMListeners(target);
						}
						else {
							target.htm_listeners = new Listeners();
						}
						return target.htm_listeners;
					}
					else {
						return target.htm_listeners;
					}
				}
				/** I think .raw is better than unchain() **/
				else if (prop === 'unchain') {
					return _=> target;
				}
				else if (prop === 'raw') {
					return target;
				}
				
				/// More experimental:
				else if (prop === 'toString') {
					return _=> target;
				}
				else if (prop === 'q') {
					return (...args)=> chain(target.querySelector(...args),opts);
				}
				else if (prop === 'qa') {
					return (...args)=> chain(target.querySelectorAll(...args),opts);
				}
				else if (Symbol.iterator in Object(target) &&!(prop in target)) {
					/* Get all array functions that take a callback as the first argument:
					   Object.getOwnPropertyNames(Array.prototype).map(name => { let v = null; try { ([1,1,1])[name](_=>{v=name}); } catch(e){}; return v}).filter(v=>v).toSorted(String.localeCompare)
					 */
					if (['every','filter','find','findIndex','findLast','findLastIndex','flatMap','forEach','map','reduce','reduceRight','some','sort','toSorted'].includes(prop)) {
						/*return (callback,...otherArgs) => {
							return chain([...target][prop]((element,...args) => callback(element instanceof EventTarget ? chain(element, opts) : element,...args),...otherArgs), opts);
						}*/
						return (callback,...otherArgs) => {
							return chain([...target][prop]((...args) => callback(...args),...otherArgs), opts);
						}
					}
					/* otherwise, if in Array.prototype */
					else if (prop in Array.prototype) {
						return (...args) => {
							return chain([...target][prop](...args), opts);
						}
					}
				}
			}
			if (!(prop in target))  return undefined;
			
			if (typeof(target[prop])=='function') {
				return (...args) => {
					//onsole.log('called',prop)
					let val = null;
					/// DOM objects are ultra-boring. Have to make sure proxies are unwrapped.
					if (target instanceof HTMLElement) {
						val = target[prop](...args.map(a => a?.[ISCHAIN] ? a.raw : a));
					}
					else {
						val = target[prop](...args);
					}
					if (typeof(val)=='object' && val != null) {
						if (typeof(val.then)=='function') {
							//onsole.log('function call returned thenable:', target, prop);
							return chainPromise(val, opts);
						}
						else {
							return chain(val, opts);
						}
					}
					/** Chain, only if the function has no defined return value **/
					else if (val === undefined) {
						return proxy;
					}
					else {
						return val;
					}
				}
			}
			else if (typeof(target[prop])=='object' && target[prop] != null) {
				if (typeof(target[prop].then)=='function') {
					return chainPromise(target[prop], opts);
				}
				else {
					return chain(target[prop], opts);
				}
			}
			else {
				return target[prop];
			}
		},
		/** erm, this is needed because (at least) assigning to DOM elements doesn't work with the pass through **/
		set(target,prop,value,received) {
			target[prop] = value;
			return true;
		}};
		let proxy = new Proxy(o, handler);
		proxy[chainSym] = true;
		proxy[ISCHAIN] = true;
		opts.root ??= proxy;
		return proxy;
	}

	global.node = node;
	global.qnode = qnode;
	global.n = n;
	global.toHtml = toHtml;
	global.html = html;
	global.q = str => chain(typeof(str)=='string' ? document.querySelector(str) : str?.jquery ? str[0] : str);
	global.qa = str => chain(typeof(str)=='string' ? document.querySelectorAll(str) : str?.jquery ? q(str.toArray()) : str);
})(window || global);