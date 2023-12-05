let scriptSrc = document.currentScript.src;
window.addEventListener('DOMContentLoaded', function() {
	/// Clicking anywhere not in a menu clears all active menu items
	document.addEventListener("click", function(evt) {
		if (!evt.target.closest(".menu")) {
			dismissActiveMenus();
		}
	});
	
	/// Add style menu style
	let link = document.createElement('link');
	link.setAttribute('type', 'text/css');
	link.setAttribute('rel', 'stylesheet');
	let menuDir = scriptSrc.replace(/\/?[^\/]*$/, '');
	link.setAttribute('href', menuDir + '/menu_styles.css');
	document.head.prepend(link);
});

function dismissActiveMenus() {
	[...document.querySelectorAll(".menu.active, .menu .active")].map(el => el.classList.remove("active"));
}

function closeMenus() {
	[...document.querySelectorAll('.menu')].forEach(el => el.remove());
}

function clearActiveSiblings(el) {
	/// Remove any active status from siblings
	let menu = el.parentElement.closest(".menu");
	if (menu) {
		[...menu.querySelectorAll(".active")].forEach(el => el.classList.remove("active"));
	}
	return el;
}

/**
|o| is an object/dict of options. options are:
 - label - the label to show for this menu
 - items - the items (e.g. MenuActions) on this menu
 - type - at a minimum, the CSS class, but may be used in other ways as well
Example: 
var menu = Menu({type: "embedded", items: [
	MenuAction('Delete', () => item.delete()),
	MenuAction("<label>Background Color:</label> <input type=text data-control=backgroundColor class=backgroundColor value=''>"),
]});
*/
function Menu(o) {
	if (!(this instanceof Menu))  return Menu.apply(Object.create(Menu.prototype), arguments);
	o = o || {};
	this.label = o.label || "";
	this.items = o.items || [];
	this.type = o.type || "";
	this.listeners = new Listeners(['show']);
	this.listeners.add('show', o.on_show);
	
	this._lastMenu = null;
	
	return this;
}
Menu.prototype = {
	make: function() {
		/// Default method to make menu
		var menu = n('div', {class: 'menu '+this.type});

		menu.append(
			n('div.header', html(this.label), {on: {click() {
				/// Mark this menu active
				let menu = this.closest(".menu");
				menu.classList.add("active");
				clearActiveSiblings(menu);
			}}})
		);

		var itemList = n('div.itemList');
		menu.append(itemList);

		this.listeners.remove('.handleForItem');
		for (var i in this.items) {
			if (this.items[i]) {
				let item = this.items[i].make();
				itemList.append(...(item.jquery ? item.toArray() : [item]));
				if (this.items[i].on_show)  this.listeners.add('show.handleForItem', this.items[i].on_show);
			}
		}

		this._lastMenu = menu;
		menu.$$menus19203$$ = this;

		return menu;
	},
	
	append(item) {
		this._lastMenu.querySelector('.itemList').append(item.make ? item.make() : item);
	},
	
	popup: function(o) {
		function isAncestor(thisEl, ancestorEl) {
			while (thisEl != null) {
				thisEl = thisEl.parentNode;
				if (thisEl == ancestorEl) {
					return true;
				}
			}
			return false;
		}
		
		if (o.getBoundingClientRect) {
			let rect = o.getBoundingClientRect();
			o = {left: rect.left, top: rect.bottom};
		}
		
		var menu = this.make();
		menu.style.left = o.left+'px';
		menu.style.top = o.top+'px';
		document.body.append(menu);
		if (menu.getBoundingClientRect().right > document.documentElement.clientWidth) {
			menu.style.left = '';
			menu.style.right = 0;
		}
		if (menu.getBoundingClientRect().bottom > document.documentElement.clientHeight) {
			menu.style.top = '';
			menu.style.bottom = 0;
		}
		/// Not in this event loop (there's a better way to do this,
		/// that's neither setTimeout nor requestAnimationFrame, but I've forgotten)
		setTimeout(_=> {
			document.addEventListener('click', function clickEvent(event) {
				if (!isAncestor(event.target, menu)) {
					menu.remove();
					document.removeEventListener('click', clickEvent);
				}
			});
		}, 0);
		
		this.listeners.get('show').forEach(l => l.func(menu));
	},
	
	dismiss: function() {
		this._lastMenu.remove();
	},
	
	collectShortcuts: function() {
		let shortcuts = {};
		for (let item of this.items) {
			Object.assign(shortcuts, item.collectShortcuts());
		}
		return shortcuts;
	},
};

/**
@label: The label to show for this menu item
@action: A function that is executed when the item is selected
@o: an object/dict of additional options. Options are:
	type - at a minimum, the CSS class, but may be used in other ways as well
	shortcut - the keyboard shortcut for this item
*/
function MenuAction(label, action, o) {
	if (!(this instanceof MenuAction))  return MenuAction.apply(Object.create(MenuAction.prototype), arguments);
	o = o ?? {};
	o = (typeof(label)=='object' && !(label.jquery || label instanceof HTMLElement)) ? label : typeof(action)=='object' ? action : o;
	this.label = label ?? o.label;
	this.action = action ?? o.action ?? function() {};
	this.type = o.type ?? "";
	this.shortcut = o.shortcut ?? null;
	this.closeAfter = o.closeAfter ?? false;
	this.on_show = o.on_show ?? null;
	return this;
}
MenuAction.prototype = {
	make: function() {
		var item = n('div', {class: 'menuAction '+this.type, tabindex: '0'});
		/// I don't know if I want this nbsp substitution
		item.append(n('div.label', html(this.label)));
		if (this.shortcut) {
			item.append(n('div.shortcut', this.shortcut));
		}
		item.addEventListener('click', event => {
			/// Disabled items are just a no-op if clicked
			if (event.target.closest('.menuAction')?.classList?.contains?.('disabled'))  return;
			if (typeof(this.action)=='function')  this.action(event);
			if (this.closeAfter) {
				closeMenus();
			}
		});
		item.addEventListener('mouseenter', function(evt) {
			//onsole.log(evt.target);
			clearActiveSiblings(evt.target.closest('.menuAction')).classList.add("active");//.focus();
		});
		item.addEventListener('mouseleave', function(evt) {
			evt.target.closest('.menuAction').classList.remove("active");
		});
		item.addEventListener('keypress', function(evt) {
			if (evt.key == "Enter") {
				this.click();
			}
		});

		return item;
	},
	
	collectShortcuts: function() {
		return this.shortcut ? {[this.shortcut]: {action: this.action, label: this.label}} : {};
	},
}
MenuItem = MenuAction;