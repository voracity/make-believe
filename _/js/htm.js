function node(tag, ...args) {
	var [tag, ...attrs] = tag.split(/(?=[.#])/);
	var el = document.createElement(tag);
	for (var attr of attrs) {
		if (attr[0] == '.')  el.classList.add(attr.slice(1));
		else if (attr[0] == '#')  el.id = attr.slice(1);
	}
	var handleArg = arg => {
		var type = typeof arg;
		if (arg === null || arg === false) {
			/// pass
		}
		else if (arg instanceof Element || arg instanceof DocumentFragment) {
			el.appendChild(arg);
		}
		else if (Array.isArray(arg)) {
			arg.forEach(handleArg)
		}
		else if (type == "string" || type == "number") {
			el.appendChild(document.createTextNode(arg));
		}
		else {
			for (var attr in arg) {
				if (node.hooks[attr])  node.hooks[attr](el, arg[attr], attr);
				else  el.setAttribute(attr, String(arg[attr]));
			}
		}
	}

	args.forEach(handleArg);
	
	return el;
}
/// Attributes that do custom things. Recommend prefixing with 'hook'. JS style names only.
node.hooks = {}
var n = node;

/// Generates a DocumentFragment from a html string
/// Use as template string: html`...`
function html(str) {
	var wrapper = document.createElement('div');
	var range = document.createRange();
	wrapper.innerHTML = str;
	range.selectNodeContents(wrapper);
	return range.extractContents();
}
