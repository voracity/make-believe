$(window).ready(function() {
	/// Clicking anywhere not in a menu clears all active menu items
	$(document).on("click", function(evt) {
		if ($(evt.target).closest(".menu").length==0) {
			dismissActiveMenus();
		}
	});
});

function dismissActiveMenus() {
	$(".menu.active, .menu .active").removeClass("active");
}

function clearActiveSiblings($el) {
	/// Remove any active status from siblings
	$el.parent().closest(".menu").find(".active").removeClass("active");
	return $el;
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
	
	this._$lastMenu = null;
	
	return this;
}
Menu.prototype = {
	make: function() {
		/// Default method to make menu
		var $menu = $("<div class='menu "+this.type+"'>");

		$menu.append(
			$("<div class=header>").append(this.label).on("click", function() {
				/// Mark this menu active
				clearActiveSiblings($(this).closest(".menu")).addClass("active");
			})
		);

		var $itemList = $("<div class=itemList>");
		$menu.append($itemList);

		for (var i in this.items) {
			$itemList.append(this.items[i].make());
		}

		return $menu;
	},
	
	popup: function(o) {
		var $menu = this.make();
		$menu
			.css({left: o.left, top: o.top})
			.appendTo('body');
		$(document).on('click', function(event) {
			if (!$(event.target).closest('.contextMenu').length) {
				$menu.remove();
			}
		});
		this._$lastMenu = $menu;
	},
	
	dismiss: function() {
		this._$lastMenu.remove();
	},
	
	collectShortcuts: function() {
		var shortcuts = {};
		for (var item of this.items) {
			$.extend(shortcuts, item.collectShortcuts());
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
	o = o || {};
	this.label = label;
	this.action = action ? action : function() {};
	this.type = o.type || "";
	this.shortcut = o.shortcut || null;
	return this;
}
MenuAction.prototype = {
	make: function() {
		var $item = $("<div class='menuAction "+this.type+"' tabindex='0'>");
		/// I don't know if I want this nbsp substitution
		$item.append($('<div class="label">').html(this.label));
		if (this.shortcut) {
			$item.append($('<div class="shortcut">').text(this.shortcut));
		}
		$item.on("click", this.action).on("mouseenter", function(evt) {
			clearActiveSiblings($(evt.target)).addClass("active").focus();
		}).on("mouseleave", function(evt) {
			$(evt.target).removeClass("active");
		}).on("keypress", function(evt) {
			if (evt.keyCode == KeyEvent.DOM_VK_RETURN) {
				$(this).click();
			}
		});

		return $item;
	},
	
	collectShortcuts: function() {
		return this.shortcut ? {[this.shortcut]: {action: this.action, label: this.label}} : {};
	},
}