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

function Menu(o) {
	if (!(this instanceof Menu))  return Menu.apply(Object.create(Menu.prototype), arguments);
	o = o || {};
	this.label = o.label || "";
	this.items = o.items || [];
	this.type = o.type || "";
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
	}
};

function MenuAction(label, action, o) {
	if (!(this instanceof MenuAction))  return MenuAction.apply(Object.create(MenuAction.prototype), arguments);
	o = o || {};
	this.label = label;
	this.action = action;
	this.type = o.type || "";
	return this;
}
MenuAction.prototype = {
	make: function() {
		var $item = $("<div class='menuAction "+this.type+"'>");
		$item.append(this.label);
		$item.on("click", this.action).on("mouseenter", function(evt) {
			clearActiveSiblings($(evt.target)).addClass("active");
		}).on("mouseleave", function(evt) {
			$(evt.target).removeClass("active");
		});
		
		return $item;
	}
}