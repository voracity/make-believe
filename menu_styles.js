$(document).ready(function() {
	$(document).on("click mouseenter", ".menu > .header", function(evt) {
		/// Ignore mouseenters on menu bars, unless something is active
		var $parentMenu = $(evt.target).closest(".menu").parent().closest(".menu");
		if (evt.type=="mouseenter" && $parentMenu.is(".bar") && $parentMenu.find(".active").length==0)  return;
		clearActiveSiblings($(this).closest(".menu")).addClass("active");
		var $clicked = $(evt.target);
		var elTop = $clicked.position().top;
		var elLeft = $clicked.position().left;

		/// If it's a bar (horizontal menu), float below
		if ($clicked.parent().parent().closest(".menu").is(".menu.bar")) {
			$(this).parent().find(".itemList").css({top: elTop + $clicked.outerHeight(), left: elLeft});
		}
		/// If it's a vertical menu, float left/right (depending on space, but prefer left)
		else {
			$itemList = $(this).parent().find(".itemList");
			console.log($clicked, elLeft, $clicked.outerWidth(), $itemList.outerWidth(), $(window).width());
			var showRight = true;
			var offsetLeft = $clicked.offset().left;
			if (offsetLeft + $clicked.outerWidth() + $itemList.outerWidth() < $(window).width()) {
				showRight = true;
			}
			else if (offsetLeft - $itemList.outerWidth() > 0) {
				showRight = false;
			}
			
			if (showRight) {
				$itemList.css({top: elTop, left: elLeft + $clicked.outerWidth()});
			}
			else {
				$itemList.css({top: elTop, left: elLeft - $itemList.outerWidth()});
			}
		}
	}).on("mouseleave", ".menu > .header", function(evt) {
		/// Ignore mouseleaves on menu bars, unless something is active
		var $parentMenu = $(evt.target).closest(".menu").parent().closest(".menu");
		if (evt.type=="mouseleave" && $parentMenu.is(".bar") && $parentMenu.find(".active").length==0)  return;
		/// Remove any active status from siblings
		clearActiveSiblings($(this).closest(".menu")).addClass("active");
	});
});
