var draw = {
	/// Create the SVG canvas for all arrows
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
	/// This is not very generalised...
	setProbBackground: function($td) {
		var probColor = "rgb(255, 198, 35)";
		var bottomBar = "#888";
		var valStr = $td.find(".prob").text();

		if (valStr.search(/^\s*(0|1|0?\.\d+)\s*/)!=-1) {
			var v = parseFloat(valStr);
			if (v >= 0 && v <= 1) {
				$td.css("background-image",
					"linear-gradient(to top,"+bottomBar+",1px,"+bottomBar+",1px,transparent),linear-gradient(to top,"+probColor+","+toPercent(v)+","+probColor+","+toPercent(v)+",transparent)");
			}
		}
	}
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
			//console.log(node);
			if (node._updateDisplay) {
				node.displayItem(outputEl, $displayNode);
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
	headerFormat: function(id, label) {
		return label ? label : id;
	},
	display: function(outputEl) {
		outputEl = outputEl || this.outputEl;
		outputEl.empty();
		var bn = this;
		var displayItems = {};
		var nodeBeliefs = this.getAllBeliefs();
		/// Setup an SVG canvas on which to draw things. At this stage,
		/// this will just be arrows.
		/// Need to wait for nodes to be drawn before we know size
		draw.createSvg(outputEl, 0, 0, 10, 10, "netSvgCanvas");

		/// Prep the submodels by adding a parents attribute. This
		/// will be removed later.
		var submodel = bn.getSubmodel(bn.currentSubmodel);
		for (var sub in submodel.submodelsById) {
			var subm = submodel.submodelsById[sub];
			subm.parents = [];
			/// XXX Need to get rid of this at some point
			subm.dynamicParents = [];
			/// Need to reset pathsIn/pathsOut
			//subm.pathsIn = [];
			//subm.pathsOut = [];
			var submNodes = subm.getAllNodes();
			for (var i=0; i<submNodes.length; i++) {
				subm.parents = subm.parents.concat(submNodes[i].parents);
			}
		}

		/// Draw all the graphItems visible in the current submodel
		var graphItems = bn.getGraphItems();

		/// Need to reset pathsIn/pathsOut first
		for (var i=0; i<graphItems.length; i++) {
			var graphItem = graphItems[i];
			graphItem.pathsIn = [];
			graphItem.pathsOut = [];
		}

		/// Before doing anything else, work out what the pathsIn/pathsOut are (with blank elements for the actual arcs)
		for (var ni=0; ni<graphItems.length; ni++) {
			var graphItem = graphItems[ni];
			if (graphItem.isHidden())  continue;

			var parents = graphItem.parents.concat(graphItem.dynamicParents);
			if (parents.length) {
				for (var i=0; i<parents.length; i++) {
					/// Clarify: Parents will be an array if from dynamicParents, maybe?
					var parent = Array.isArray(parents[i]) ? parents[i][0] : parents[i];
					if (parent.isAlwaysHidden())  continue;

					/// If parent belongs to a descendant submodel, need to deal with it differently
					var j=0;
					for (; j<parent.submodelPath.length; j++) {
						if (parent.submodelPath[j] != bn.currentSubmodel[j])  break;
					}
					/// This means parent is in current submodel, or a descendent.
					/// Only draw arcs for these cases.
					if (j == bn.currentSubmodel.length) {
						/// This means parent is strictly in a descendent submodel
						if (parent.submodelPath.length > j) {
							/// Sub in the submodel as the parent!
							parent = bn.getSubmodel(parent.submodelPath.slice(0,j+1));
						}
						if (parent.id != graphItem.id) {
							/// XXX Update these if nodes can be deleted
							graphItem.pathsIn.push({pathId: null, parentItem: parent, _unused: null, pathOutIndex: parent.pathsOut.length});
							parent.pathsOut.push({pathId: null, childItem: graphItem, _unused: null, pathInIndex:graphItem.pathsIn.length-1});
						}
					}
				}
			}
		}

		var maxX = 0;
		var maxY = 0;
		for (var i=0; i<graphItems.length; i++) {
			var graphItem = graphItems[i];
			if (graphItem.isHidden())  continue;

			var $displayItem = graphItem.displayItem(outputEl);
			displayItems[graphItem.id] = $displayItem;

			/// Get max x/y as extents for canvas
			var b = draw.getBox($displayItem);
			maxX = Math.max(maxX, b.x+b.width);
			maxY = Math.max(maxY, b.y+b.height);
		}

		/// If in submodel, add way to get back up!
		if (bn.currentSubmodel.length) {
			outputEl.append(
				$("<div class='submodel parent'>..</div>")
					.data("submodel", bn.getSubmodel(bn.currentSubmodel.slice(0,-1)) )
			);
		}

		/// Draw the text objects
		/// XXX todo
		for (var i=0; i<bn.displayItems.length; i++) {
			var item = bn.displayItems[i];
			if (item.isHidden()) continue;

			item.displayItem(outputEl);
		}

		/// Draw all the arcs
		for (var i=0; i<graphItems.length; i++) {
			var graphItem = graphItems[i];
			if (graphItem.isHidden())  continue;

			/// Draw arcs that go into this item
			for (var j=0; j<graphItem.pathsIn.length; j++) {
				var parentItem = graphItem.pathsIn[j].parentItem;
				var path = draw.drawArrowBetweenBoxes($(".netSvgCanvas"), draw.getBox($('#display_'+parentItem.id)), draw.getBox($('#display_'+graphItem.id)));

				/// Now we need to populate the pathsIn/pathsOut references
				var pathId = (""+Math.random()).replace(/\./, '_');
				$(path).attr("id", pathId);
				graphItem.pathsIn[j].pathId = pathId;
				parentItem.pathsOut[graphItem.pathsIn[j].pathOutIndex].pathId = pathId;
			}
		}

		/// Resize the SVG
		//console.log(maxX, maxY);
		$(".netSvgCanvas").attr("width", maxX).attr("height", maxY);

		/// Remove parents from submodels
		var submodel = bn.getSubmodel(bn.currentSubmodel);
		for (var sub in submodel.submodelsById) {
			var subm = submodel.submodelsById[sub];
			delete subm.parents;
			/// XXX Need to get rid of this at some point
			delete subm.dynamicParents;
		}
	},
	redrawArcs: function(graphItem, width, height) {
		var $graphItem = this.outputEl.find("#display_"+graphItem.id);

		/// Update max x/y as extents for canvas if necessary
		var b = draw.getBox($graphItem);
		var maxX = Math.max(width, b.x+b.width);
		var maxY = Math.max(height, b.y+b.height);
		if (maxX != width || maxY != height) {
			$(".netSvgCanvas").attr("width", maxX).attr("height", maxY);
		}

		for (var i=0; i<graphItem.pathsIn.length; i++) {
			var $parent = $('#display_'+graphItem.pathsIn[i].parentItem.id);
			draw.drawArrowBetweenBoxes($("#"+graphItem.pathsIn[i].pathId), draw.getBox($parent), draw.getBox($graphItem));
		}
		for (var i=0; i<graphItem.pathsOut.length; i++) {
			var $child = $('#display_'+graphItem.pathsOut[i].childItem.id);
			draw.drawArrowBetweenBoxes($("#"+graphItem.pathsOut[i].pathId), draw.getBox($graphItem), draw.getBox($child));
		}
	},
	getGraphItems: function() {
		var currentSubmodel = this.getSubmodel(this.currentSubmodel);
		var graphItems = currentSubmodel.subNodes.slice();
		for (var subId in currentSubmodel.submodelsById)  graphItems.push(currentSubmodel.submodelsById[subId]);
		return graphItems;
	},
	getGraphItemById: function(id) {
		if (this.nodesById[id])  return this.nodesById[id];
		var currentSubmodel = this.getSubmodel(this.currentSubmodel);
		if (currentSubmodel.submodelsById[id])  return currentSubmodel.submodelsById[id];
		for (var i=0; i<this.displayItems.length; i++) {
			if (this.displayItems[i].id == id)  return this.displayItems[i];
		}
		return null;
	},
	redrawAllArcs: function() {
		var graphItems = this.getGraphItems();
		for (var i=0; i<graphItems.length; i++) {
			var graphItem = graphItems[i];
			var $graphItem = this.outputEl.find("#display_"+graphItem.id);
			for (var j=0; j<graphItem.pathsIn.length; j++) {
				var $parent = $('#display_'+graphItem.pathsIn[j].parentItem.id);
				draw.drawArrowBetweenBoxes($("#"+graphItem.pathsIn[j].pathId), draw.getBox($parent), draw.getBox($graphItem));
			}
		}
	},
	measureCanvasNeeds: function() {
		var maxX = 0;
		var maxY = 0;
		var currentSubmodel = currentBn.getSubmodel(currentBn.currentSubmodel);
		var graphItems = currentSubmodel.subNodes.slice();
		for (var subId in currentSubmodel.submodelsById)  graphItems.push(currentSubmodel.submodelsById[subId]);
		for (var i=0; i<graphItems.length; i++) {
			var graphItem = graphItems[i];
			if (graphItem.isHidden && graphItem.isHidden())  continue;
			var $displayNode = $("#display_"+graphItem.id);
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
Submodel.prototype = $.extend(Submodel.prototype, {
	displayItem: function(outputEl, $displayNode) {
		var submodel = this;
		if (!$displayNode) {
			$displayNode = $("<div class=submodel id=display_"+submodel.id+" draggable=true>")
				.css({left: submodel.pos.x+"px", top: submodel.pos.y+"px"})
				.append(
					$("<h6>").text(submodel.net.headerFormat(submodel.id, submodel.label))
				)
				/// Add back a pointer to the submodel data structure
				.data("submodel", submodel)
				.appendTo(outputEl);
			/*if (node.format.borderColor) {
				$displayNode.css('border-color', node.format.borderColor);
				$displayNode.find('h6').css('border-color', node.format.borderColor);
			}
			if (node.format.backgroundColor)  $displayNode.css('background', node.format.backgroundColor);
			if (node.format.fontColor)  $displayNode.css('color', node.format.fontColor);
			if (node.format.fontFamily)  $displayNode.css('font-family', node.format.fontFamily);
			if (node.format.fontSize)  $displayNode.css('font-size', node.format.fontSize+'pt');*/
		}

		return $displayNode;
	},
	isHidden: function() {
		var submodelHidden = true;
		if (this.submodelPath.join("/") == this.net.currentSubmodel.join("/")) {
			submodelHidden = false;
		}
		/// There are no 'engineOnly' submodels yet. But DBN reimplementation might
		/// change that!
		/// return this.engineOnly || submodelHidden;
		return submodelHidden;
	},
	isVisible: function() {
		return !this.isHidden();
	},
	contextMenu: function() {
		var node = this;

		var whatsDirty = {};

		/** Options **/
		var $options = $('<div class=options>');
		var menu = Menu({type: "embedded", items: [
			MenuAction("<label>Node ID:</label> <input type=text data-control=nodeId class=nodeId value='"+toHtml(node.id)+"' pattern='[a-zA-Z_][a-zA-Z_0-9]*'>", function() { }),
			MenuAction("<label>Label:</label> <input type=text data-control=nodeLabel class=nodeLabel value='"+toHtml(node.label)+"'>", function() { }),
			MenuAction("<label>Submodel:</label> <input type=text data-control=submodelPath class=submodelPath value='"+toHtml(node.path())+"'>", function() { }),
		]});
		$options.append(menu.make());
		/** End options **/

		/** Format **/
		/*var $format = $('<div class=format>');
		var formatMenu = Menu({type: "embedded", items: [
			MenuAction("<label>Background Color:</label> <input type=text data-control=backgroundColor class=backgroundColor value='"+toHtml(node.format.backgroundColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("<label>Border Color:</label> <input type=text data-control=borderColor class=borderColor value='"+toHtml(node.format.borderColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("<label>Text Color:</label> <input type=text data-control=textColor class=textColor value='"+toHtml(node.format.fontColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("<label>Font Family:</label> <input type=text data-control=fontFamily class=fontFamily value='"+toHtml(node.format.fontFamily)+"' placeholder='[default]'>", function() { }),
			MenuAction("<label>Font Size:</label> <input type=text data-control=fontSize class=fontSize value='"+toHtml(node.format.fontSize)+"' pattern='[0-9]*' placeholder='[default]'>", function() { }),
		]});
		$format.append(formatMenu.make());*/
		/** End Format **/

		var tabs = new TabSet([
			{id: 'main', label: 'Options', content: $options, active: true},
			//{id: 'format', label: 'Format', content: $format},
		]);

		popupEditDialog(tabs.$tabs, {className: 'node', controls: {
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
			submodelPath: {change: function(val) {
				node.path(val);
				currentBn.display();
				currentBn.displayBeliefs();
			}},
			nodeId: {change: function(val) {
				var $displayNode = $('#display_'+node.id);
				$displayNode.attr("id", 'display_'+val);
				node.rename(val);
				$displayNode.find('h6').html(currentBn.headerFormat(node.id,node.label));
			}},
			nodeLabel: {change: function(val) {
				var $displayNode = $('#display_'+node.id);
				node.label = val;
				$displayNode.find('h6').html(currentBn.headerFormat(node.id,node.label));
			}},
		}});

	},
});
Node.prototype = $.extend(Node.prototype, {
	displayItem: function(outputEl, $displayNode) {
		var node = this;
		if (!$displayNode) {
			$displayNode = $("<div class=node id=display_"+node.id+" draggable=true>")
				.css({left: node.pos.x+"px", top: node.pos.y+"px"})
				.append(
					$("<h6>").text(node.net.headerFormat(node.id, node.label))
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
	/// This is the context menu for any ordinary node visible on the canvas. It has a set
	/// of tabs that change based on the type of node. (e.g. CPT tab is displayed for
	/// discrete chance nodes, while function text is displayed for equation/continuous nodes)
	contextMenu: function() {
		var node = this;

		var whatsDirty = {cpt: false, funcText: false, nodeId: false, comment: false};

		var options = [];
		var possTypes = ['Nature','Decision','Utility'];
		for (var i=0; i<possTypes.length; i++) {
			options.push($("<option>").text(possTypes[i]));
			if (node.type == possTypes[i].toLowerCase()) {
				options[options.length-1].attr("selected","selected");
			}
		}
		var $nodeType = $("<select>").append(options);

		/** Options **/
		var $options = $('<div class=options>');
		var menu = Menu({type: "embedded", items: [
			MenuAction("<label>Node ID:</label> <input type=text data-control=nodeId class=nodeId value='"+toHtml(node.id)+"' pattern='[a-zA-Z_][a-zA-Z_0-9]*'>", function() { }),
			MenuAction("<label>Label:</label> <input type=text data-control=nodeLabel class=nodeLabel value='"+toHtml(node.label)+"'>", function() { }),
			MenuAction("<label>Type:</label> "+$nodeType[0].outerHTML, function() { }),
			MenuAction("<label>Submodel:</label> <input type=text data-control=submodelPath class=submodelPath value='"+toHtml(node.path())+"' pattern='[/a-zA-Z_0-9]*'>", function() { }),
			MenuAction("Delete...", function() { node.guiDelete(); }),
			MenuAction("<div class=commentSec><label>Comment:</label><textarea class=comment data-control=comment>"+toHtml(node.comment)+"</textarea></div>", function(){}),
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
				$tr.append('<th class=stateLabel><span data-control=state contenteditable>'+toHtml(node.states[i].id)+'</span></th>');
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
					var $td = $("<td>")
						.append("<span class=prob contenteditable data-control=cpt>"+toChance(sigFig(row[j],3))+"</span>");
					draw.setProbBackground($td);
					$td.find(".prob").on("keyup", function() {
						draw.setProbBackground($(this).closest("td"));
						/// This row was possibly set to invalid. Clear, if any change made
						$(this).closest("tr").removeClass("invalid");
					});
					$tr.append($td);
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
				$('<textarea data-control=funcText>').val(node.funcText)
			);
			defTab = {id: 'func', label: 'Function', content: $funcDialog};
		}
		if (node.type == "decision") {
			defTab = null;
		}

		/** Format **/
		var $format = $('<div class=format>');
		var formatMenu = Menu({type: "embedded", items: [
			MenuAction("<label>Background Color:</label> <input type=text data-control=backgroundColor class=backgroundColor value='"+toHtml(node.format.backgroundColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("<label>Border Color:</label> <input type=text data-control=borderColor class=borderColor value='"+toHtml(node.format.borderColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("<label>Text Color:</label> <input type=text data-control=textColor class=textColor value='"+toHtml(node.format.fontColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("<label>Font Family:</label> <input type=text data-control=fontFamily class=fontFamily value='"+toHtml(node.format.fontFamily)+"' placeholder='[default]'>", function() { }),
			MenuAction("<label>Font Size:</label> <input type=text data-control=fontSize class=fontSize value='"+toHtml(node.format.fontSize)+"' pattern='[0-9]*' placeholder='[default]'>", function() { }),
		]});
		$format.append(formatMenu.make());

		var tabs = new TabSet([
			{id: 'main', label: 'Options', content: $options, active: true},
			defTab,
			{id: 'format', label: 'Format', content: $format},
		]);

		popupEditDialog(tabs.$tabs, {className: 'node', controls: {
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
			submodelPath: {change: function(val) {
				node.path(val);
				currentBn.display();
				currentBn.displayBeliefs();
			}},
			nodeId: {change: function(val) {
				var $displayNode = $('#display_'+node.id);
				$displayNode.attr("id", 'display_'+val);
				node.rename(val);
				$displayNode.find('h6').html(currentBn.headerFormat(node.id,node.label));
			}},
			nodeLabel: {change: function(val) {
				var $displayNode = $('#display_'+node.id);
				node.label = val;
				$displayNode.find('h6').html(currentBn.headerFormat(node.id,node.label));
			}},
			funcText: {change: function(val) {
				node.equation($(".func textarea").val());
				currentBn.updateAndDisplayBeliefs();
			}},
			comment: {change: function(val) {
				console.log('xx');
				node.comment = $(".dialog textarea.comment").val();
			}},
			cpt: {change: function(val) {
				var newCpt = $(".dialog .prob").map(function() { return $(this).text(); }).toArray();
				/// XXX Lots to clean up and fix
				var numRows = node.cpt.length/node.states.length;
				var invalid = false;
				for (var r=0; r<numRows; r++) {
					var sum = 0;
					for (var c=0; c<node.states.length; c++) {
						sum += parseFloat(newCpt[r*node.states.length + c]);
					}
					//console.log(r, sum);
					if (Math.round(sum*1000) != 1000) {
						invalid = true;
						$(".dialog .cpt tr:nth("+(r+1)+")").addClass("invalid");
					}
				}
				if (invalid) {
					alert('One or more rows do not sum to 1.');
					return false;
				}
				else {
					node.cpt1d(newCpt);
					currentBn.updateAndDisplayBeliefs();
				}
			}},
			state: {change: function() {
				var states = $(".dialog .stateLabel").map(function() { return $(this).text(); }).toArray();
				/// XXX Validate the rename
				var o = {};
				for (var i=0; i<states.length; i++)  o[i] = states[i].trim();
				console.log(o);
				node.renameStates(o);
				currentBn.display();
				currentBn.displayBeliefs();
			}},
		}});
	},
	guiDelete: function() {
		var node = this;
		/// FIX: Once have undo/redo, remove the prompt
		popupDialog($('<div>Are you sure?</div>'), {buttons: [
			$('<button type=button>').html('Delete').on('click', function() {
				node.delete();

				/// Remove objects for node and arcs (and probably more in future)
				node.net.outputEl.find('#display_'+node.id).remove();
				for (var p of node.pathsIn)  node.net.outputEl.find('#'+p.pathId).remove();
				for (var p of node.pathsOut)  node.net.outputEl.find('#'+p.pathId).remove();

				 app.updateBN();
				 dismissDialogs();
			}),
			$('<button type=button>').html('Cancel').on('click', dismissDialogs),
		]});
	},
	isHidden: function() {
		var submodelHidden = true;
		if (this.submodelPath.join("/") == this.net.currentSubmodel.join("/")) {
			submodelHidden = false;
		}
		return this.engineOnly || submodelHidden;
	},
	isAlwaysHidden: function() {
		return this.engineOnly;
	},
	isVisible: function() {
		return !this.isHidden();
	},
});
TextBox.prototype = $.extend(TextBox.prototype, {
	displayItem: function(outputEl, $displayNode) {
		var node = this;
		if (!$displayNode) {
			$displayNode = $("<div class=textBox id=display_"+node.id+" draggable=true>")
				.css({left: node.pos.x+"px", top: node.pos.y+"px"})
				.css({width: node.size.width+"px", height: node.size.height+"px"})
				.append(
					node.net.headerFormat(toHtml(node.text).replace(/\\n/g, '<br>'))
				)
				.appendTo(outputEl);
			if (node.format) {
				if (node.format.borderColor) {
					$displayNode.css('border-color', node.format.borderColor);
					$displayNode.find('h6').css('border-color', node.format.borderColor);
				}
				if (node.format.backgroundColor)  $displayNode.css('background', node.format.backgroundColor);
				if (node.format.fontColor)  $displayNode.css('color', node.format.fontColor);
				if (node.format.fontFamily)  $displayNode.css('font-family', node.format.fontFamily);
				if (node.format.fontSize)  $displayNode.css('font-size', node.format.fontSize+'pt');
				if (node.format.bold)  $displayNode.css('font-weight', 'bold');
				if (node.format.italic)  $displayNode.css('font-style', 'italic');
				if (node.format.align)  $displayNode.css('text-align', node.format.align);
			}
		}
		if (node.type)  $displayNode.addClass(node.type);

		return $displayNode;
	},
	isHidden: function() {
		var submodelHidden = true;
		if (this.submodelPath.join("/") == this.net.currentSubmodel.join("/")) {
			submodelHidden = false;
		}
		return submodelHidden;
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
	/** Calculate the probability of evidence, and then
	    display it to the user, as a probability and in the form
	    of self-information.
	**/
	showProbabilityOfEvidence: function() {
		currentBn.calcProbabilityOfEvidence(function(prob, selfInfo) {
			popupDialog('<div>The probability of the evidence is <strong>'+sigFig(prob,4)+'</strong>. The self-information (-log(P)) in nits is <strong>'+sigFig(selfInfo,3)+'</strong>.</div><button type=button class=okButton>OK</button></div>');
			$(".dialog .okButton").one("click", dismissDialogs);
		});
	},
	autoLayout: function() {
		var g = new dagre.graphlib.Graph();
		g.setGraph({});
		g.setDefaultEdgeLabel(function(){ return {}; });

		var graphItems = currentBn.getGraphItems();

		for (var i=0; i < graphItems.length; i++) {
			var node = graphItems[i];
			if (node.isHidden && node.isHidden())  continue;
			var $node = $("#display_"+node.id);
			var width = $node.outerWidth();
			var height = $node.outerHeight();
			g.setNode(node.id, { label: (node.label || node.id), width: width, height: height} );
		}

		for (var i=0; i < graphItems.length; i++) {
			var node = graphItems[i];
			if (node.isHidden && node.isHidden())  continue;
			for (var j=0; j < node.pathsOut.length; j++) {
				//if (node.pathsOut[j].isHidden())  continue;
				g.setEdge(node.id, node.pathsOut[j].childItem.id);
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
			var pos = currentBn.getGraphItemById(nodeId).pos;
			currentBn.getGraphItemById(nodeId)._prevPos = {x: pos.x, y: pos.y};
			pos.x = x;
			pos.y = y;
			$("#display_"+nodeId).css({top: y, left: x});
		});
		/// Layout the arcs and save their positions
		for (var i=0; i<graphItems.length; i++) {
			var node = graphItems[i];
			if (node.isHidden && node.isHidden())  continue;
			var $child = $("#display_"+node.id);
			for (var j=0; j<node.pathsIn.length; j++) {
				$parent = $("#display_"+node.pathsIn[j].parentItem.id);
				draw.drawArrowBetweenBoxes($("#"+node.pathsIn[j].pathId), draw.getBox($parent), draw.getBox($child));
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
			var x = currentBn.getGraphItemById(nodeId)._prevPos.x, y = currentBn.getGraphItemById(nodeId)._prevPos.y;
			delete currentBn.getGraphItemById(nodeId)._prevPos;
			currentBn.getGraphItemById(nodeId).pos.x = x;
			currentBn.getGraphItemById(nodeId).pos.y = y;
			$("#display_"+nodeId).css({top: y, left: x});
		});
		/// and arcs
		for (var i=0; i<graphItems.length; i++) {
			var node = graphItems[i];
			if (node.isHidden && node.isHidden())  continue;
			var $child = $("#display_"+node.id);
			for (var j=0; j<node.pathsIn.length; j++) {
				$parent = $("#display_"+node.pathsIn[j].parentItem.id);
				draw.drawArrowBetweenBoxes($("#"+node.pathsIn[j].pathId), draw.getBox($parent), draw.getBox($child));
			}
		}

		/// Now, animate the nodes...
		g.nodes().forEach(function(nodeId) {
			//console.log(currentBn.getGraphItemById(nodeId));
			var x = Math.round(g.node(nodeId).x), y = Math.round(g.node(nodeId).y);
			currentBn.getGraphItemById(nodeId).pos.x = x;
			currentBn.getGraphItemById(nodeId).pos.y = y;
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
	changeNodeHeader: function(type) {
		if (type=='id') {
			currentBn.headerFormat = function(id,label) { return toHtml(id); }
		}
		else if (type=='label') {
			currentBn.headerFormat = function(id,label) { return toHtml(label ? label : id); }
		}
		else if (type=='idLabel') {
			currentBn.headerFormat = function(id,label) { return toHtml((label ? label+": " : "")+id); }
		}
		var graphItems = currentBn.getGraphItems();
		for (var i=0; i<graphItems.length; i++) {
			var graphItem = graphItems[i];
			$("#display_"+graphItem.id+" h6").html(currentBn.headerFormat(graphItem.id,graphItem.label));
		}
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
	/** This will remove all submodel information from a network,
	    and then relay it out, since otherwise everything will be on top of each other.
	    XXX Add a method to 'expand inside' so as to preserve the original layout as much as possible. **/
	flattenNetwork: function() {
		var bn = currentBn;
		for (var i=0; i<bn.nodes.length; i++) {
			bn.nodes[i].submodelPath = [];
		}
		bn.currentSubmodel = [];
		bn.submodelsById = {};
		bn.subNodes = bn.nodes.slice();
		bn.display();
		bn.displayBeliefs();
		app.autoLayout();
	},
};

$(document).ready(function() {
	var exampleBns = "Asia.xdsl|Bunce's Farm.xdsl|Cancer.dne|Continuous Test.xdsl|RS Latch.xdsl|Umbrella.xdsl|Water.xdsl".split(/\|/);
	var exampleBnActions = [];
	for (var i in exampleBns) {
		/// Need html escape function
		exampleBnActions[i] = MenuAction('<span data-name="'+exampleBns[i]+'">'+exampleBns[i]+'</span>', function() {
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
				MenuAction('<hr>'),
				MenuAction('Header: ID', function() { app.changeNodeHeader('id'); dismissActiveMenus(); }),
				MenuAction('Header: Label', function() { app.changeNodeHeader('label'); dismissActiveMenus(); }),
				MenuAction('Header: Label + ID', function() { app.changeNodeHeader('idLabel'); dismissActiveMenus(); }),
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
			MenuAction('Flatten Network', function() { app.flattenNetwork(); dismissActiveMenus(); } ),
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
	$(".bnview").on("mousedown", ".node h6, .submodel:not(.parent), .textBox", function(event) {
		if (event.which > 1)  return;
		event.preventDefault();
		mx = event.originalEvent.pageX;
		my = event.originalEvent.pageY;
		//onsole.log("mousedown:", mx, my);
		var $node = $(this).closest(".node, .submodel, .textBox");
		var o = $node.offset();

		/// Get the width/height if the mousedown node was not part of the network
		var maxX = 0, maxY = 0;
		var graphItems = currentBn.getGraphItems();
		for (var i=0; i<graphItems.length; i++) {
			var graphItem = graphItems[i];
			if (graphItem.isHidden && graphItem.isHidden())  continue;
			if (("display_"+graphItem.id)==$node.attr("id"))  continue;
			var n = draw.getBox($("#display_"+graphItem.id));
			maxX = Math.max(maxX, n.x+n.width);
			maxY = Math.max(maxY, n.y+n.height);
		}

		$(".bnouterview").on("mousemove", function(event) {
			var nmx = event.originalEvent.pageX;
			var nmy = event.originalEvent.pageY;
			//onsole.log("mousemove:", nmx, nmy, {left: o.left + (nmx - mx), top: o.top + (nmy - my)});
			/// Move the DOM object, but not the net object yet
			$node.offset({left: o.left + (nmx - mx), top: o.top + (nmy - my)});
			var n = currentBn.getGraphItemById($node.attr("id").replace(/^display_/,""));
			if (n.pathsIn)  currentBn.redrawArcs(n, maxX, maxY);
		});
		$(".bnouterview").on("mouseup", function(event) {
			/// Update position of the node
			var nmx = event.originalEvent.pageX;
			var nmy = event.originalEvent.pageY;
			//onsole.log("mouseup:", nmx, nmy, {left: o.left + (nmx - mx), top: o.top + (nmy - my)});
			$node.offset({left: o.left + (nmx - mx), top: o.top + (nmy - my)});
			$(".bnouterview").unbind("mousemove").unbind("mouseup");

			/// Now it's final, update the net object
			var n = currentBn.getGraphItemById($node.attr("id").replace(/^display_/,""));
			n.pos.x += (nmx - mx);
			n.pos.y += (nmy - my);

			/// Update the arcs going into/out of this node
			if (n.pathsIn)  currentBn.redrawArcs(n, maxX, maxY);
		});
	});

	/** This needs to change **/
	$(".bnview").on("dblclick", ".textBox", function() {
		console.log('xx');
		$(this).attr("contenteditable", "");
	});

	/// Submodel navigation
	$(".bnview").on("dblclick", ".submodel", function() {
		currentBn.currentSubmodel = $(this).data("submodel").submodelPath.concat($(this).data("submodel").id ? [$(this).data("submodel").id] : []);
		currentBn.display();
		currentBn.displayBeliefs();
	});

	$(".bnview").on("dblclick", function(event) {
		var i = 0;
		while (currentBn.nodesById["node"+i]) i++;
		if ($(event.target).is(".bnview") || $(event.target).is(".netSvgCanvas")) {
			currentBn.addNode("node"+i, ["state0","state1"], {cpt:[.5,.5], pos: {x: event.offsetX, y: event.offsetY}, addToCanvas: true});
		}
		event.preventDefault();
		return false;
	});

	$(document).on("contextmenu", ".node, .submodel", function(evt) {
		if (evt.shiftKey)  return false;
		var $displayItem = $(this);
		var item = currentBn.getItemById($displayItem.attr("id").replace(/^display_/, ''));
		item.contextMenu();
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

