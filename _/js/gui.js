var draw = {
	createSvg: function(outputEl, x, y, width, height, cls) {
		return $("<svg width="+(width)+" height="+(height)+"><defs>\
				<marker id='arrowhead' viewBox='0 0 10 10' refX='10' refY='5' \
				markerUnits='strokeWidth' orient='auto'\
				markerWidth='10' markerHeight='9'>\
				<polyline points='0,0 10,5 0,10 1,5' fill=black/>\
				</marker>\
				</defs></svg>")
			.attr("class", cls)
			.css({left: x, top: y, position: "absolute"})
			.appendTo(outputEl);
	},
	getAngle: function(refVector, angledVector) {
		var r = Math.atan2(angledVector[0], angledVector[1]) - Math.atan2(refVector[0], refVector[1]);
		if (r > Math.PI)  r -= 2*Math.PI;
		else if (r < -Math.PI)  r += 2*Math.PI;
		if (r < 0)  r += 2*Math.PI;
		return r;
	},
	getBox: function(el) {
		el = $(el);
		return {x: el.position().left, y: el.position().top, width: el.outerWidth(), height: el.outerHeight()};
	},
	drawArrow: function(outputEl, from, to) {
		var sx = sy = 10; //startX, startY
		var width = Math.abs(from.x - to.x);
		var height = Math.abs(from.y - to.y);

		var $svg = null;
		var insideSvg = $(outputEl)[0].tagName.toUpperCase() == "SVG";

		if (insideSvg) {
			$svg = $(outputEl);
		}
		else {
			$svg = $("<svg width="+(width+20)+" height="+(height+20)+"><defs>\
				<marker id='arrowhead' viewBox='0 0 10 10' refX='10' refY='5' \
				markerUnits='strokeWidth' orient='auto'\
				markerWidth='10' markerHeight='9'>\
				<polyline points='0,0 10,5 0,10 1,5' fill=black/>\
				</marker>\
				</defs></svg>").appendTo(outputEl);
		}

		var firstX, firstY, lastX, lastY, svgX, svgY;
		if (from.x < to.x) { firstX = sx; lastX = sx+width; svgX = from.x; }
		else { firstX = sx+width; lastX = sx; svgX = to.x; }
		if (from.y < to.y) { firstY = sy; lastY = sy+height; svgY = from.y; }
		else { firstY = sy+height; lastY = sy; svgY = to.y; }

		//onsole.debug(svgX, svgY);
		var path = null;
		if (insideSvg) {
			$svg.append(path = makeSvg("path", {
				d: "M "+(svgX-sx+firstX)+" "+(svgY-sy+firstY)+" L "+(svgX-sx+lastX)+" "+(svgY-sy+lastY),
				stroke: "black",
				"class": 'dependency',
				"stroke-width": 1,
				"marker-end": "url(#arrowhead)"
			}));
		}
		else {
			$svg.append(path = makeSvg("path", {
				d: "M "+firstX+" "+firstY+" L "+lastX+" "+lastY,
				stroke: "black",
				"stroke-width": 1,
				"marker-end": "url(#arrowhead)"
			}))
				.css({left: svgX-sx, top: svgY-sy, position: "absolute"});
		}
		return path;
	},
	makePolyline: function(width, height, viewWidth, viewHeight, points) {
		var pointsStr = "";
		for (var i=0; i<points.length; i++) {
			pointsStr += points[i][0]+","+points[i][1]+" ";
		}
		return $("<svg width="+(width)+" height="+(height)+" viewBox='0 0 "+viewWidth+" "+viewHeight+"'>\
			<polyline points='"+pointsStr+"' style='fill:none;stroke:black'/>\
			</svg>");
	},
	makeProbabilityLine: function(width, height, points) {
		var fmtPoints = [];
		for (var i=0; i<points.length; i++)  fmtPoints.push([i/(points.length-1)*width,height-points[i]*height]);
		return this.makePolyline(width, height, width, height, fmtPoints);
	},
	drawArrowBetweenBoxes: function(outputEl, par, child) {
		/// Calculate the line that runs between the center of the two boxes
		var parX = par.x + par.width/2;
		var parY = par.y + par.height/2;
		var childX = child.x + child.width/2;
		var childY = child.y + child.height/2;

		/// In the coordinate space of the center point
		var diagVector = [par.width/2, par.height/2];
		var arrowVector = [childX - parX, childY - parY];
		/// These run from 0 to 2PI. The "origin" line starts at about 135 degrees on a typical X-Y plane and moves anti-clockwise
		var angleBetweenDiags = draw.getAngle([-diagVector[0], -diagVector[1]], [-diagVector[0], diagVector[1]]);
		var angleBetween = draw.getAngle([-diagVector[0], -diagVector[1]], arrowVector);
		//onsole.debug("X:", diagVector, arrowVector, angleBetweenDiags, angleBetween);
		var parIntersect = null;
		if (angleBetween < angleBetweenDiags) {
			var p1 = $L([parX, parY], arrowVector),
				p2 = $L([par.x,par.y], [0,1]);
			parIntersect = p1.intersectionWith(p2);
		}
		else if (angleBetween < Math.PI) {
			var p1 = $L([parX, parY], arrowVector),
				p2 = $L([par.x+par.width,par.y+par.height], [1,0]);
			parIntersect = p1.intersectionWith(p2);
		}
		else if (angleBetween < Math.PI + angleBetweenDiags) {
			var p1 = $L([parX,parY], arrowVector),
				p2 = $L([par.x+par.width,par.y+par.height], [0,1]);
			parIntersect = p1.intersectionWith(p2);
		}
		else {
			var p1 = $L([parX, parY], arrowVector),
				p2 = $L([par.x,par.y], [1,0]);
			parIntersect = p1.intersectionWith(p2);
		}

		/// In the coordinate space of the center point
		var diagVector = [child.width/2, child.height/2];
		var arrowVector = [parX - childX, parY - childY];
		/// These run from 0 to 2PI. The "origin" line starts at about 135 degrees on a typical X-Y plane and moves anti-clockwise
		var angleBetweenDiags = draw.getAngle([-diagVector[0], -diagVector[1]], [-diagVector[0], diagVector[1]]);
		var angleBetween = draw.getAngle([-diagVector[0], -diagVector[1]], arrowVector);
		//onsole.debug("X:", diagVector, arrowVector, angleBetweenDiags, angleBetween);
		var childIntersect = null;
		if (angleBetween < angleBetweenDiags) {
			var p1 = $L([childX, childY], arrowVector),
				p2 = $L([child.x,child.y], [0,1]);
			childIntersect = p1.intersectionWith(p2);
		}
		else if (angleBetween < Math.PI) {
			var p1 = $L([childX, childY], arrowVector),
				p2 = $L([child.x+child.width,child.y+child.height], [1,0]);
			childIntersect = p1.intersectionWith(p2);
		}
		else if (angleBetween < Math.PI + angleBetweenDiags) {
			var p1 = $L([childX,childY], arrowVector),
				p2 = $L([child.x+child.width,child.y+child.height], [0,1]);
			childIntersect = p1.intersectionWith(p2);
		}
		else {
			var p1 = $L([childX, childY], arrowVector),
				p2 = $L([child.x,child.y], [1,0]);
			childIntersect = p1.intersectionWith(p2);
		}

		/// If we've been given a path, just update the d attribute
		if ($(outputEl)[0].tagName.toUpperCase() == "PATH") {
			var p = {x: parIntersect.e(1), y: parIntersect.e(2)}, c = {x: childIntersect.e(1), y: childIntersect.e(2)};
			return $(outputEl).attr("d", "M "+p.x+" "+p.y+" L "+c.x+" "+c.y);
		}
		else {
			return draw.drawArrow(outputEl, {x: parIntersect.e(1), y: parIntersect.e(2)}, {x: childIntersect.e(1), y: childIntersect.e(2)});
		}
	},
};




/////////////////////////////////////////////////////
/// Add display capabilities to the BN, nodes, etc.
/////////////////////////////////////////////////////
BN.prototype = $.extend(BN.prototype, {
	updateAndDisplayBeliefs: function(outputEl, callback) {
		var bn = this;
		if (this.useWorkers) {
			this.updateBeliefs_worker(function() {
				bn.displayBeliefs(outputEl);
				if (callback)  callback(bn);
			});
		}
		else {
			this.updateBeliefs();
			this.displayBeliefs(outputEl);
			if (callback)  callback(this);
		}
	},
	displayBeliefs: function(outputEl) {
		outputEl = outputEl || this.outputEl;
		for (var i in this.nodes) {
			var node = this.nodes[i];
			if (node.slice != 0)  break;

			var $displayNode = outputEl.find("#display_"+node.id);
			if (node._updateDisplay) {
				this.displayNode(outputEl, node, $displayNode);
				node._updateDisplay = false;
			}
			var stateI = 0;
			var allBeliefs = this.getDbnBeliefs(node.id);
			$displayNode.find(".state").each(function() {
				if (node.dynamic) {
					$(this).find(".beliefBarView").html(
						draw.makeProbabilityLine(100, 20, allBeliefs.map(function(a){ return a[stateI]; })).css("border", "solid 1px #ccc")
					);
				}
				else {
					var pc = Math.round(node.beliefs[stateI]*1000)/1000;
					$(this).find(".prob").text(String(pc).replace(/^0\./, '.'));
					$(this).find(".beliefBar").css({width:(pc*100)+'%'});
				}
				stateI++;
			});
		}

		if (this._utilityNodes.length) {
			if (!$(".status .expectedValue").length) {
				$(".status").append('<span class=expectedValue title="Expected value (or utility) of the current network">Expected value: <span class=val></span></span>');
			}
			$(".status .expectedValue .val").text(Math.round(this.expectedValue*1000)/1000);
		}

		if (this._trackingArcInfluences) {
			this.displayArcsWithInfluences();
		}
	},
	displayNode: function(outputEl, node, $displayNode) {
		if (!$displayNode) {
			$displayNode = $("<div class=node id=display_"+node.id+" draggable=true>")
				.css({left: node.pos.x+"px", top: node.pos.y+"px"})
				.append(
					$("<h6>").text(node.label ? node.label : node.id)
				)
				.appendTo(outputEl);
			if (node.format.borderColor) {
				$displayNode.css('border-color', node.format.borderColor);
				$displayNode.find('h6').css('border-color', node.format.borderColor);
			}
			if (node.format.backgroundColor)  $displayNode.css('background', node.format.backgroundColor);
			if (node.format.fontColor)  $displayNode.css('color', node.format.fontColor);
			if (node.format.fontFamily)  $displayNode.css('font-family', node.format.fontFamily);
			if (node.format.fontSize)  $displayNode.css('font-size', node.format.fontSize+'pt');
		}
		if (node.dynamic)  $displayNode.addClass("dynamic");
		$displayNode.addClass(node.type);
		/// Clear out any existing states first
		$displayNode.find(".state").remove();
		for (var j=0; j<node.states.length; j++) {
			var state = node.states[j];
			$displayNode.append(
				$("<div class=state>").append(
					$("<div class=stateName>").text(state.id)
				).append(
					$("\
					<div class=prob></div>\
					<div class=beliefBarView>\
						<div class=beliefBar></div>\
					</div>\
					")
				)
			);
		}

		return $displayNode;
	},
	display: function(outputEl) {
		outputEl = outputEl || this.outputEl;
		outputEl.empty();
		var bn = this;
		var displayNodes = {};
		var nodeBeliefs = this.getAllBeliefs();
		/// Setup an SVG canvas on which to draw things. At this stage,
		/// this will just be arrows.
		/// Need to wait for nodes to be drawn before we know size
		draw.createSvg(outputEl, 0, 0, 10, 10, "netSvgCanvas");

		/// Draw all the nodes
		var maxX = 0;
		var maxY = 0;
		for (var i=0; i<bn.nodes.length; i++) {
			var node = bn.nodes[i];
			if (node.engineOnly)  continue;

			var $displayNode = this.displayNode(outputEl, node);
			displayNodes[node.id] = $displayNode;

			/// Get max x/y as extents for canvas
			var b = draw.getBox($displayNode);
			maxX = Math.max(maxX, b.x+b.width);
			maxY = Math.max(maxY, b.y+b.height);
		}

		/// Resize the SVG
		//console.log(maxX, maxY);
		$(".netSvgCanvas").attr("width", maxX).attr("height", maxY);

		/// Draw all the arcs
		var allNodes = bn.nodes;
		for (var ni=0; ni<allNodes.length; ni++) {
			var node = allNodes[ni];
			if (node.engineOnly)  continue;

			/// XXX Remove dependency on XDSL
			var parents = node.parents.concat(node.dynamicParents);
			if (parents.length) {
				for (var i=0; i<parents.length; i++) {
					/// Clarify: Parents will be an array if from dynamicParents, maybe?
					var parent = Array.isArray(parents[i]) ? parents[i][0] : parents[i];
					var n = displayNodes[parent.id];
					var par = draw.getBox(n);
					//onsole.log("par:", parents[i], par);
					n = displayNodes[node.id];
					var child = draw.getBox(n);
					//onsole.log("child:", node.id, child);

					var path = draw.drawArrowBetweenBoxes($(".netSvgCanvas"), par, child);
					$(path).attr("id", (""+Math.random()).replace(/\./, '_'));
					/// XXX Update these if nodes can be deleted
					node.pathsIn.push([$(path).attr("id"),parent]);
					parent.pathsOut.push([$(path).attr("id"),node]);
				}
			}
		}
	},
	redrawArcs: function(node, width, height) {
		var $node = this.outputEl.find("#display_"+node.id);

		/// Update max x/y as extents for canvas if necessary
		var b = draw.getBox($node);
		var maxX = Math.max(width, b.x+b.width);
		var maxY = Math.max(height, b.y+b.height);
		if (maxX != width || maxY != height) {
			$(".netSvgCanvas").attr("width", maxX).attr("height", maxY);
		}

		for (var i=0; i<node.pathsIn.length; i++) {
			var $parent = this.outputEl.find("#display_"+node.pathsIn[i][1].id);
			draw.drawArrowBetweenBoxes($("#"+node.pathsIn[i][0]), draw.getBox($parent), draw.getBox($node));
		}
		for (var i=0; i<node.pathsOut.length; i++) {
			var $child = this.outputEl.find("#display_"+node.pathsOut[i][1].id);
			draw.drawArrowBetweenBoxes($("#"+node.pathsOut[i][0]), draw.getBox($node), draw.getBox($child));
		}
	},
	redrawAllArcs: function() {
		for (var i=0; i<currentBn.nodes.length; i++) {
			var node = currentBn.nodes[i];
			var $node = this.outputEl.find("#display_"+node.id);
			for (var j=0; j<node.pathsIn.length; j++) {
				var $parent = this.outputEl.find("#display_"+node.pathsIn[j][1].id);
				draw.drawArrowBetweenBoxes($("#"+node.pathsIn[j][0]), draw.getBox($parent), draw.getBox($node));
			}
		}
	},
	measureCanvasNeeds: function() {
		var maxX = 0;
		var maxY = 0;
		for (var i=0; i<currentBn.nodes.length; i++) {
			var node = currentBn.nodes[i];
			var $displayNode = $("#display_"+node.id);
			/// Get max x/y as extents for canvas
			var b = draw.getBox($displayNode);
			maxX = Math.max(maxX, b.x+b.width);
			maxY = Math.max(maxY, b.y+b.height);
		}
		return {maxX: maxX, maxY: maxY};
	},
	resizeCanvasToFit: function() {
		var m = this.measureCanvasNeeds();
		$(".netSvgCanvas").attr("width", m.maxX).attr("height", m.maxY);
	},
});
Node.prototype = $.extend(Node.prototype, {
	contextMenu: function() {
		var node = this;

		var whatsDirty = {cpt: false, funcText: false, nodeId: false, comment: false};

		/** Options **/
		var $options = $('<div class=options>');
		var menu = Menu({type: "embedded", items: [
			MenuAction("Node ID: <input type=text data-control=nodeId class=nodeId value='"+toHtml(node.id)+"' pattern='[a-zA-Z_][a-zA-Z_0-9]*'>", function() { }),
			MenuAction("Delete...", function() { node.guiDelete(); }),
			MenuAction("<div class=commentSec><label>Comment:</label><textarea class=comment>"+toHtml(node.comment)+"</textarea></div>", function(){}),
		]});
		$options.append(menu.make());
		/** End options **/

		var defTab = null;

		/** CPT **/
		if (node.cpt) {
			var $table = $("<table class=cpt>");
			var npc = node.numParentCombinations();
			var parentIndexes = currentBn.setupIndexes(node.parents);
			/// Write out header
			var $tr = $('<tr>');
			for (var i=0; i<node.parents.length; i++) {
				$tr.append('<th>'+toHtml(node.parents[i].id)+'</th>');
			}
			for (var i=0; i<node.states.length; i++) {
				$tr.append('<th>'+toHtml(node.states[i].id)+'</th>');
			}
			$table.append($tr);
			/// Write out each row
			for (var i=0; i<npc; i++) {
				var row = node.getRow(i);
				var $tr = $("<tr>");
				/// List all parents on the side (Netica style)
				for (var k=0; k<node.parents.length; k++) {
					var parent = node.parents[k];
					$tr.append("<th>"+toHtml(parent.states[parentIndexes[k]].id)+"</th>");
				}
				currentBn.nextCombination(node.parents, parentIndexes);
				/// Now list the distro for each row
				for (var j=0; j<row.length; j++) {
					$tr.append("<td><span class=prob contenteditable>"+sigFig(row[j],3)+"</span></td>");
				}
				$table.append($tr);
			}
			/// XXX: Finish adding the tab set to the context menu popup
			var $cptDialog = $('<div class=cptDialog>').append($table);
			defTab = {id: 'cpt', label: 'CPT', content: $cptDialog};
		}
		else if (node.funcDef) {
			/// XXX: Finish adding the tab set to the context menu popup
			var $funcDialog = $('<div class=funcDialog>').append(
				$('<textarea>').val(node.funcText)
			);
			defTab = {id: 'func', label: 'Function', content: $funcDialog};
		}

		/** Format **/
		var $format = $('<div class=format>');
		var formatMenu = Menu({type: "embedded", items: [
			MenuAction("Background Color: <input type=text data-control=backgroundColor class=backgroundColor value='"+toHtml(node.format.backgroundColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("Border Color: <input type=text data-control=borderColor class=borderColor value='"+toHtml(node.format.borderColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("Text Color: <input type=text data-control=textColor class=textColor value='"+toHtml(node.format.fontColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("Font Family: <input type=text data-control=fontFamily class=fontFamily value='"+toHtml(node.format.fontFamily)+"' placeholder='[default]'>", function() { }),
			MenuAction("Font Size: <input type=text data-control=fontSize class=fontSize value='"+toHtml(node.format.fontSize)+"' pattern='[0-9]*' placeholder='[default]'>", function() { }),
		]});
		$format.append(formatMenu.make());

		var tabs = new TabSet([
			{id: 'main', label: 'Options', content: $options, active: true},
			defTab,
			{id: 'format', label: 'Format', content: $format},
		]);
		/** All this needs to be re-written to remove the repetition into a loop. **/
		popupDialog(tabs.$tabs, {className: 'node contextMenu', buttons: [
			$('<button type=button class=saveButton disabled>').html('Save').on('click', function() {
				$(".dialog .saveButton")[0].disabled = true;
				console.log(whatsDirty);
				if (whatsDirty.cpt) {
					whatsDirty.cpt = false;
					var newCpt = $(".dialog .prob").map(function() { return $(this).text(); }).toArray();
					node.cpt1d(newCpt);
					$(".dialog .saveButton")[0].disabled = true;
					currentBn.updateAndDisplayBeliefs();
				}
				if (whatsDirty.nodeId) {
					whatsDirty.nodeId = false;
					if ($('.dialog input.nodeId').is(':valid')) {
						var newId = $('.dialog input.nodeId').val();
						var $displayNode = $('#display_'+node.id);
						$displayNode.attr("id", 'display_'+newId);
						$displayNode.find('h6').text(newId);
						node.rename(newId);
					}
				}
				if (whatsDirty.funcText) {
					whatsDirty.funcText = false;
					node.equation($(".func textarea").val());
					currentBn.updateAndDisplayBeliefs();
				}
				if (whatsDirty.comment) {
					whatsDirty.comment = false;
					node.comment = $(".dialog textarea.comment").val();
				}
				var controls = {
					backgroundColor: {change: function(val) {
						var $displayNode = $('#display_'+node.id);
						$displayNode.css('background-color', val);
						node.format.backgroundColor = val;
					}},
					borderColor: {change: function(val) {
						var $displayNode = $('#display_'+node.id);
						$displayNode.css('border-color', val);
						$displayNode.find('h6').css('border-color', val);
						node.format.borderColor = val;
					}},
					textColor: {change: function(val) {
						var $displayNode = $('#display_'+node.id);
						$displayNode.css('color', val);
						node.format.fontColor = val;
					}},
					fontFamily: {change: function(val) {
						var $displayNode = $('#display_'+node.id);
						$displayNode.css('font-family', val);
						node.format.fontFamily = val;
					}},
					fontSize: {change: function(val) {
						var $displayNode = $('#display_'+node.id);
						$displayNode.css('font-size', val+'pt');
						node.format.fontSize = val;
					}},
				};
				for (var control in controls) {
					if (whatsDirty[control]) {
						whatsDirty[control] = false;
						if ($('.dialog input.'+control).is(':valid')) {
							var val = $('.dialog input.'+control).val();
							controls[control].change(val);
						}
					}
				}
			}),
			$('<button type=button class=closeButton>').html('Close').on('click', dismissDialogs),
		]});
		$(".dialog").on("change keyup", function(event) {
			if ($(event.target).closest('input[data-control]').length) {
				var name = $(event.target).closest('input').data('control');
				whatsDirty[name] = true;
			}
			if ($(event.target).closest('.cpt').length)  whatsDirty.cpt = true;
			if ($(event.target).closest('.func').length)  whatsDirty.funcText = true;
			if ($(event.target).closest('textarea.comment').length)  whatsDirty.comment = true;
			$(".dialog .saveButton")[0].disabled = false;
		});
	},
	guiDelete: function() {
		var node = this;
		/// FIX: Once have undo/redo, remove the prompt
		popupDialog($('<div>Are you sure?</div>'), {buttons: [
			$('<button type=button>').html('Delete').on('click', function() {
				node.delete();

				/// Remove objects for node and arcs (and probably more in future)
				node.net.outputEl.find('#display_'+node.id).remove();
				for (var p of node.pathsIn)  node.net.outputEl.find('#'+p[0]).remove();
				for (var p of node.pathsOut)  node.net.outputEl.find('#'+p[0]).remove();

				 app.updateBN();
				 dismissDialogs();
			}),
			$('<button type=button>').html('Cancel').on('click', dismissDialogs),
		]});
	},
});



var app = {
	loadFile: function() {
		loadFile();
	},
	saveFile: function() {
		$("a#download")
			.attr('href', 'data:text/plain;base64,'+window.btoa(currentBn.save_xdsl()))
			.attr('download', currentBn.fileName.replace(/\.\w*$/, '.xdsl'))
			[0].click();
	},
	updateBN: function() {
		var start = performance.now();
		updateBN(function() {
			var durationMs = (performance.now() - start);
			if ($(".status .duration").length==0) {
				$(".status").append("<span class=duration title='Time taken for last computation'>Last: <span class=val></span>ms</span>");
			}
			$(".status .duration .val").text(Math.round(durationMs*1000)/1000);
		});
	},
	findGoodDecisions: function() {
		if (!currentBn._decisionNodes.length) {
			popupDialog("<p>This network has no decision nodes.<div class=controls><button type=button class=okButton>OK</button></div>");
			$(".dialog .okButton").one("click", dismissDialogs);
			return;
		}
		var str = "";
		var dec;
		if (numNodeStateCombinations(currentBn._decisionNodes) < 100) {
			dec = currentBn.searchDecisionsAll();
		}
		else {
			str += "<strong>Too many decision combinations. Using decision order instead.</strong>";
			dec = currentBn.searchDecisionsOrdered();
		}
		for (var i=0; i<dec.length; i++) {
			str += "<div>"+dec[i] + "</div>";
		}
		popupDialog(str+"<div class=controls><button type=button class=okButton>OK</button></div>");
		$(".dialog .okButton").one("click", dismissDialogs);
	},
	showProbabilityOfEvidence: function() {
		currentBn.calcProbabilityOfEvidence(function(prob, info) {
			popupDialog('<div>The probability of evidence is <strong>'+prob+'</strong></div><button type=button class=okButton>OK</button></div>');
			$(".dialog .okButton").one("click", dismissDialogs);
		});
	},
	autoLayout: function() {
		var g = new dagre.graphlib.Graph();
		g.setGraph({});
		g.setDefaultEdgeLabel(function(){ return {}; });

		for (var i=0; i < currentBn.nodes.length; i++) {
			var node = currentBn.nodes[i];
			var $node = $("#display_"+node.id);
			var width = $node.outerWidth();
			var height = $node.outerHeight();
			g.setNode(node.id, { label: (node.label || node.id), width: width, height: height} );
		}

		for (var i=0; i < currentBn.nodes.length; i++) {
			var node = currentBn.nodes[i];
			for (var j=0; j < node.children.length; j++) {
				g.setEdge(node.id, node.children[j].id);
			}
		}

		dagre.layout(g);

		/// Store the endpoints for all arcs
		var startArcPositions = {};
		$('.dependency').each(function() {
			var arr = $(this).attr('d').replace(/[a-zA-Z]/g, '').replace(/^\s+|\s+$/g, '').split(/\s+/);
			for (var i=0; i<arr.length; i++)  arr[i] = parseFloat(arr[i]);
			startArcPositions[$(this).attr("id")] = arr;
		});
		console.log("startArcPositions", startArcPositions);

		/** WARNING: There's lots of duplication in the following. This is largely for speed.
			(But could probably be made better anyway...)   **/

		/// Do a final layout, to work out where all the arrows end up
		/// (The layout doesn't actually visibly change, because it
		/// all changes within one javascript block)
		g.nodes().forEach(function(nodeId) {
			var x = Math.round(g.node(nodeId).x), y = Math.round(g.node(nodeId).y);
			var pos = currentBn.nodesById[nodeId].pos;
			currentBn.nodesById[nodeId]._prevPos = {x: pos.x, y: pos.y};
			pos.x = x;
			pos.y = y;
			$("#display_"+nodeId).css({top: y, left: x});
		});
		/// Layout the arcs and save their positions
		for (var i=0; i<currentBn.nodes.length; i++) {
			var node = currentBn.nodes[i];
			var $child = $("#display_"+node.id);
			for (var j=0; j<node.pathsIn.length; j++) {
				$parent = $("#display_"+node.pathsIn[j][1].id);
				draw.drawArrowBetweenBoxes($("#"+node.pathsIn[j][0]), draw.getBox($parent), draw.getBox($child));
			}
		}
		var m = currentBn.measureCanvasNeeds();
		if (m.maxX > $(".netSvgCanvas").width()) {
			$(".netSvgCanvas").attr("width", m.maxX);
		}
		if (m.maxY > $(".netSvgCanvas").height()) {
			$(".netSvgCanvas").attr("height", m.maxY);
		}

		/// Store the endpoints for all arcs
		var endArcPositions = {};
		$('.dependency').each(function() {
			var arr = $(this).attr('d').replace(/[a-zA-Z]/g, '').replace(/^\s+|\s+$/g, '').split(/\s+/);
			for (var i=0; i<arr.length; i++)  arr[i] = parseFloat(arr[i]);
			endArcPositions[$(this).attr("id")] = arr;
		});
		console.log("endArcPositions", endArcPositions);

		/// Restore positions
		g.nodes().forEach(function(nodeId) {
			var x = currentBn.nodesById[nodeId]._prevPos.x, y = currentBn.nodesById[nodeId]._prevPos.y;
			delete currentBn.nodesById[nodeId]._prevPos;
			currentBn.nodesById[nodeId].pos.x = x;
			currentBn.nodesById[nodeId].pos.y = y;
			$("#display_"+nodeId).css({top: y, left: x});
		});
		/// and arcs
		for (var i=0; i<currentBn.nodes.length; i++) {
			var node = currentBn.nodes[i];
			var $child = $("#display_"+node.id);
			for (var j=0; j<node.pathsIn.length; j++) {
				$parent = $("#display_"+node.pathsIn[j][1].id);
				draw.drawArrowBetweenBoxes($("#"+node.pathsIn[j][0]), draw.getBox($parent), draw.getBox($child));
			}
		}

		/// Now, animate the nodes...
		g.nodes().forEach(function(nodeId) {
			//console.log(currentBn.nodesById[nodeId]);
			var x = Math.round(g.node(nodeId).x), y = Math.round(g.node(nodeId).y);
			currentBn.nodesById[nodeId].pos.x = x;
			currentBn.nodesById[nodeId].pos.y = y;
			$("#display_"+nodeId).animate({top: y, left: x}, 400);
		});

		/// ...and animate the arcs
		/// FIX: Arcs just animate with linear interpolation. They should use same easing function
		/// as nodes
		var start = null;
		var duration = 350;
		requestAnimationFrame(function step(timestamp) {
			if (!start)  start = timestamp;
			var progress = timestamp - start;
			var propProgress = Math.min(1,progress/duration);
			console.log(progress, propProgress);
			var vecLength = 4;
			for (var i in startArcPositions) {
				var mixPosition = newArray(vecLength, 0);
				for (var j=0; j<vecLength; j++) {
					mixPosition[j] = propProgress*endArcPositions[i][j] + (1-propProgress)*startArcPositions[i][j];
				}
				$('#'+i).attr('d', 'M '+mixPosition[0]+' '+mixPosition[1]+' L '+mixPosition[2]+' '+mixPosition[3]);
			}
			/*for (var i=0; i<currentBn.nodes.length; i++) {
				var node = currentBn.nodes[i];
				var $child = $("#display_"+node.id);
				for (var j=0; j<node.pathsIn.length; j++) {
					$parent = $("#display_"+node.pathsIn[j][1].id);
					draw.drawArrowBetweenBoxes($("#"+node.pathsIn[j][0]), draw.getBox($parent), draw.getBox($child));
				}
			}*/
			if (progress < duration) {
				requestAnimationFrame(step);
			}
			else {
				currentBn.resizeCanvasToFit();
			}
		});

		/** End duplication warning. **/

		/*currentBn.display();
		currentBn.displayBeliefs();*/
	},
	/** Change the (NYI: selected) nodes to display as labels or distributions. This requires a relayout of BN. **/
	changeNodeView: function(type) {
		$('.bnview .node').removeClass('label').removeClass('distro');
		if (type=='label') {
			$('.bnview .node').addClass('label');
		}
		else if (type=='distro') {
			$('.bnview .node').addClass('distro');
		}
		currentBn.redrawAllArcs();
		currentBn.resizeCanvasToFit()
	},
	learnParametersCounting: function() {
		$('#openDataFile').on('change', function() {
			readChosenFile(this, function(fileData) {
				loadTabbedData(fileData);
				currentBn.learnParametersCounting(openData[openData.length-1]);
				app.updateBN();
			});
		}).click();
	},
};

$(document).ready(function() {
	var exampleBns = "Asia.xdsl|Cancer.dne|Continuous Test.xdsl|RS Latch.xdsl|Umbrella.xdsl|Water.xdsl".split(/\|/);
	var exampleBnActions = [];
	for (var i in exampleBns) {
		/// Need html escape function
		exampleBnActions[i] = MenuAction('<span data-name="'+exampleBns[i]+'" style="white-space: nowrap;">'+exampleBns[i]+'</span>', function() {
			window.location.href = "?file=bns/"+$(this).find('span').data("name");
		});
	}

	var menu = Menu({type: "bar", items: [
		Menu({label:"File", items: [
			MenuAction("Open...", function(){ app.loadFile(); dismissActiveMenus(); }),
			MenuAction("Save...", function(){ app.saveFile(); dismissActiveMenus(); }),
			Menu({label: "Example BNs", items: exampleBnActions}),
		]}),
		Menu({label:"View", items: [
			MenuAction('<input type="range" name="viewZoom" min="0.25" max="3" step="0.25" value="1"> <span class="viewZoomText">100%</span>', function(){}),
			MenuAction("Auto-Layout", function() { app.autoLayout(); dismissActiveMenus(); }),
			Menu({label: "Nodes", items: [
				MenuAction('Labels Only', function() { app.changeNodeView('label'); dismissActiveMenus(); }),
				MenuAction('Detailed Nodes', function() { app.changeNodeView('distro'); dismissActiveMenus(); }),
			]}),
			MenuAction('<input type="checkbox" class=showArcStrengths> Show Arc Strengths', function() {
				if ( !$('.showArcStrengths').prop('checked') ) {
					currentBn.trackArcInfluences();
					app.updateBN();
					$('.showArcStrengths').prop('checked', true);
				}
				else {
					currentBn.removeTrackArcInfluences();
					$('.showArcStrengths').prop('checked', false);
				}
			}),
		]}),
		Menu({label:"Network", items: [
			MenuAction("Update", function() { app.updateBN(); dismissActiveMenus(); }),
			MenuAction("Find Good Decisions", function() { app.findGoodDecisions(); dismissActiveMenus(); }),
			MenuAction('Calculate Probability of Evidence', function() { app.showProbabilityOfEvidence(); dismissActiveMenus(); } ),
			MenuAction('# Samples: <input type="text" name="iterations" value="1000">', function() { }),
			MenuAction('Learn Parameters (Counting) ...', function() { app.learnParametersCounting(); dismissActiveMenus(); } ),
		]}),
		Menu({label:"(Debug)", items: [
			MenuAction('# Workers: <input type="text" name="numWorkers" value="2">', function() { }),
			MenuAction('# Perf Loops: <input type="text" name="perfLoops" value="100">', function() { }),
			MenuAction('# Perf Samples: <input type="text" name="perfIterations" value="1000">', function() { }),
			MenuAction('Perf Check Local', function() { currentBn.perfCheck(); }),
			MenuAction('Perf Check Worker', function() { currentBn.perfCheckWorker(); }),
			MenuAction("Load Data...", function(){ $('#openDataFile').change(function() {
				readChosenFile(this, loadTabbedData);
			}).click(); dismissActiveMenus(); }),
			Menu({label:"Tests", items: [
				MenuAction('Run Tests', function() { alert('Check JavaScript console for results'); testing.runTests(); }),
			]}),
		]}),
	]});

	$("body").prepend(menu.make());

	$(".bnview").on("click", ".stateName", function() {
		var nodeId = $(this).closest(".node").attr("id").replace(/^display_/, '');
		var node = currentBn.nodesById[nodeId];
		var stateI = node.statesById[$(this).text()].index;
		if (node.dynamic) {
			var checks = "";
			var selectStr = "<select>";
			selectStr += "<option value=-1>(not set)</option>";
			for (var i=0; i<node.states.length; i++) {
				selectStr += "<option value="+i+">"+node.states[i].id+"</option>";
			}
			selectStr += "</select>";
			for (var i=0; i<10; i++) {
				checks += "<div class='timestep time"+i+"'>"+selectStr+"</div>";
			}
			popupDialog("Please specify the evidence for each time slice:"
				+checks
				+"<div class=controls><button type=button class='okButton'>OK</button></div>");
			var t = 0;
			$(".dialog .timestep").each(function() {
				$(this).find("select").val( currentBn.evidence[nodeId+(t==0?"":"_"+t)] );
				t++;
			});
			$(".dialog .okButton").one("click", function() {
				var t = 0;
				$(".dialog").find(".timestep").each(function() {
					var timeStepVal = $(this).find("select").val();

					if (timeStepVal == -1) {
						delete currentBn.evidence[nodeId+(t==0?"":"_"+t)];
					}
					else {
						currentBn.evidence[nodeId+(t==0?"":"_"+t)] = Number(timeStepVal);
					}
					t++;
				});
				dismissDialogs(function(){currentBn.updateAndDisplayBeliefs()});
			});
		}
		else {
			if (typeof(currentBn.evidence[nodeId])!="undefined") {
				/// Remove the evidence
				var isNewState = currentBn.evidence[nodeId] != stateI;
				delete currentBn.evidence[nodeId];
				/// Set new evidence
				if (isNewState) {
					currentBn.evidence[nodeId] = stateI;
				}
				/// Remove visual indicator of evidence if no new evidence
				else {
					$("#display_"+nodeId).removeClass("hasEvidence");
				}
			}
			else {
				/// Save the evidence
				currentBn.evidence[nodeId] = stateI;

				/// Update display
				$("#display_"+nodeId).addClass("hasEvidence");
			}
			app.updateBN();
		}
	});

	var mx = 0, my = 0;
	$(".bnview").on("mousedown", ".node h6", function(event) {
		if (event.which > 1)  return;
		event.preventDefault();
		mx = event.originalEvent.pageX;
		my = event.originalEvent.pageY;
		//onsole.log("mousedown:", mx, my);
		var $node = $(this).closest(".node");
		var o = $node.offset();

		/// Get the width/height if the mousedown node was not part of the network
		var maxX = 0, maxY = 0;
		for (var i=0; i<currentBn.nodes.length; i++) {
			if (currentBn.nodes[i].engineOnly)  continue;
			if (("display_"+currentBn.nodes[i].id)==$node.attr("id"))  continue;
			var n = draw.getBox($("#display_"+currentBn.nodes[i].id));
			maxX = Math.max(maxX, n.x+n.width);
			maxY = Math.max(maxY, n.y+n.height);
		}

		$(".bnouterview").on("mousemove", function(event) {
			var nmx = event.originalEvent.pageX;
			var nmy = event.originalEvent.pageY;
			//onsole.log("mousemove:", nmx, nmy, {left: o.left + (nmx - mx), top: o.top + (nmy - my)});
			/// Move the DOM object, but not the net object yet
			$node.offset({left: o.left + (nmx - mx), top: o.top + (nmy - my)});
			var n = currentBn.nodesById[$node.attr("id").replace(/^display_/,"")];
			currentBn.redrawArcs(n, maxX, maxY);
		});
		$(".bnouterview").on("mouseup", function(event) {
			/// Update position of the node
			var nmx = event.originalEvent.pageX;
			var nmy = event.originalEvent.pageY;
			//onsole.log("mouseup:", nmx, nmy, {left: o.left + (nmx - mx), top: o.top + (nmy - my)});
			$node.offset({left: o.left + (nmx - mx), top: o.top + (nmy - my)});
			$(".bnouterview").unbind("mousemove").unbind("mouseup");

			/// Now it's final, update the net object
			var n = currentBn.nodesById[$node.attr("id").replace(/^display_/,"")];
			n.pos.x += (nmx - mx);
			n.pos.y += (nmy - my);

			/// Update the arcs going into/out of this node
			currentBn.redrawArcs(n, maxX, maxY);
		});
	});

	$(document).on("dblclick contextmenu", ".node", function(evt) {
		if (evt.shiftKey)  return false;
		var node = currentBn.nodesById[$(this).attr("id").replace(/^display_/, '')];
		node.contextMenu();
		return false;
	});

	$("[name=viewZoom]").on("input change", function(evt) {
		var $range = $(evt.target);
		$(".bnview").css({transformOrigin: 'top left', transform: 'scale('+$range.val()+')'});
		$(".viewZoomText").text(Math.round($range.val()*100)+"%");
	}).on("dblclick", function(evt) {
		var $range = $(evt.target);
		$range.val(1);
		$range.trigger("change");
	});

	/// Handle an example BN load
	$(".exampleBns").on("change", function() {
		window.location.href = "?file=bns/"+$(this).find("option:selected").text();
	});

	/// Handle changes to iterations
	$("[name=iterations]").on("keyup", function(evt) {
		var numIterations = $(evt.target).val();
		currentBn.iterations = numIterations;
	});
	$("[name=perfLoops]").on("keyup", function(evt) {
		var numLoops = $(evt.target).val();
		currentBn.perfLoops = numLoops;
	});
	$("[name=perfIterations]").on("keyup", function(evt) {
		var numIterations = $(evt.target).val();
		currentBn.perfIterations = numIterations;
	});
	$("[name=numWorkers]").on("keyup", function(evt) {
		var numWorkers = $(evt.target).val();
		currentBn.numWorkers = parseInt(numWorkers);
		currentBn.needsCompile = true;
	});

	if (window.qs.file) {
		loadFromServer(window.qs.file, updateBN);
	}
});

