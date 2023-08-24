window.addEventListener('DOMContentLoaded', function() {
	function windowWidth() {
	  return Math.max(
		document.body.scrollWidth,
		document.documentElement.scrollWidth,
		document.body.offsetWidth,
		document.documentElement.offsetWidth,
		document.documentElement.clientWidth
	  );
	}

	function windowHeight() {
	  return Math.max(
		document.body.scrollHeight,
		document.documentElement.scrollHeight,
		document.body.offsetHeight,
		document.documentElement.offsetHeight,
		document.documentElement.clientHeight
	  );
	}
	
	function offset(el) {
		var rect = el.getBoundingClientRect();

		return {
		  top: rect.top + document.body.scrollTop,
		  left: rect.left + document.body.scrollLeft
		};
	}
	/**
	This stuff is way too expensive for a general purpose menu. Need to do them at the time
	of creation.
	*/
	function headerMouseover(evt) {
		if (!evt.target.closest(".menu > .header"))  return;
		/// Ignore mouseenters on menu bars, unless something is active
		let thisMenu = evt.target.closest(".menu");
		let parentMenu = thisMenu.parentElement.closest(".menu");
		if (!parentMenu)  return;
		if (evt.type=="mouseenter" && parentMenu.matches(".bar") && !parentMenu.querySelector(".active"))  return;
		clearActiveSiblings(evt.target.closest(".menu")).classList.add("active");
		let clicked = evt.target;
		let elTop = clicked.offsetTop;
		let elLeft = clicked.offsetLeft;

		/// If it's a bar (horizontal menu), float below
		if (clicked.parentElement.parentElement.closest(".menu").matches(".menu.bar")) {
			Object.assign(evt.target.parentElement.querySelector(".itemList").style, {top: elTop + clicked.offsetHeight+"px", left: elLeft+"px"});
		}
		/// If it's a vertical menu, float left/right (depending on space, but prefer left)
		else {
			itemList = evt.target.parentElement.querySelector(".itemList");
			//onsole.log(clicked, elLeft, clicked.offsetWidth, itemList.offsetWidth, windowWidth());
			let showRight = true;
			let offsetLeft = offset(clicked).left;
			if (offsetLeft + clicked.offsetWidth + itemList.offsetWidth < windowWidth()) {
				showRight = true;
			}
			else if (offsetLeft - itemList.offsetWidth > 0) {
				showRight = false;
			}
			
			if (showRight) {
				Object.assign(itemList.style, {top: elTop+'px', left: (elLeft + clicked.offsetWidth)+'px'});
			}
			else {
				Object.assign(itemList.style, {top: elTop, left: (elLeft - itemList.offsetWidth)+'px'});
			}
		}
		
		thisMenu.$$menus19203$$.listeners.get('show').forEach(l => l.func(thisMenu));
	}
	function mouseLeave(evt) {
		if (!evt.target.closest(".menu > .header"))  return;
		/// Ignore mouseleaves on menu bars, unless something is active
		let parentMenu = evt.target.closest(".menu").parentElement.closest(".menu");
		if (!parentMenu)  return;
		//onsole.log(parentMenu.matches(".bar"), parentMenu.querySelector(".active"));
		if (parentMenu.matches(".bar") && !parentMenu.querySelector(".active"))  return;
		//onsole.log('clear!', evt.target);
		/// Remove any active status from siblings
		clearActiveSiblings(evt.target.closest(".menu")).classList.add("active");
	} 
	document.body.addEventListener("click", headerMouseover);
	document.body.addEventListener("mouseenter", headerMouseover, true);
	document.body.addEventListener("mouseleave", mouseLeave, true);
});