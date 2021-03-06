$(window).ready(function() {
	$(document).on("click", ".tabSet > .tabStrip > button", function() {
		/// Hide all tabs
		$(this).closest('.tabSet').find('.active').removeClass('active');
		/// Show this tab
		$(this).addClass('active');
		$(this).closest('.tabSet').find('.tab.'+$(this).data('for')).addClass('active');
	});
});

function TabSet(tabs) {
	var $tabs = $('<div class="tabSet">');
	var $tabStrip = $('<div class=tabStrip>');
	$tabs.append($tabStrip);
	for (var i=0; i<tabs.length; i++) {
		/// Skip blanks
		if (!tabs[i])  continue;

		$tabStrip.append($('<button type=button data-for="'+tabs[i].id+'">').text(tabs[i].label).addClass(tabs[i].active ? 'active' : null));
		$tabs.append($('<div class="tab '+tabs[i].id+'">').append(tabs[i].content).addClass(tabs[i].active ? 'active' : null));
	}
	this.$tabs = $tabs;
}
