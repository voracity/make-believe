var keyboardShortcuts = {};
var guiBnCount = 0;

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
		el = $(el)[0];
		var r;
		var cachedBox = $(el).data('cachedBox');
		var elLeft = null;
		var elTop = null;
		/// offset* is *way* faster than jQuery's position(), but is not defined for some
		/// things (like SVG elements)
		if (el.offsetLeft !== undefined) {
			elLeft = el.offsetLeft;
			elTop = el.offsetTop;
		}
		else {
			var pos = $(el).position();
			elLeft = pos.left;
			elTop = pos.top;
		}
		if (cachedBox) {
			box = cachedBox;
			box.x = elLeft;
			box.y = elTop;
		}
		else {
			/// Assuming all borders have same radius
			r = parseFloat(getComputedStyle(el)["border-top-left-radius"]);
			/// More reliable than (currently possessed) jQuery for width/height
			var box = el.getBoundingClientRect();
			/// position() is *seriously* slow, and worse in 3.2 than 2.x. It's odd because
			/// position() should just return offsetLeft/offsetTop.
			//box.x = el.position().left;
			//box.y = el.position().top;
			box.x = elLeft;
			box.y = elTop;
			box.borderRadius = r;
			/// get computed style broken (IMO), at least in Firefox. Returns specified
			/// border-radius (or 0 if not specified), not the one *actually* used to draw the border.
			if (r > box.width/2)  r = box.width/2;
			if (r > box.height/2)  r = box.height/2;
		}

		return box;
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
			var clickable = null;
			$svg.append(clickable = makeSvg("path", {
				d: "M "+(svgX-sx+firstX)+" "+(svgY-sy+firstY)+" L "+(svgX-sx+lastX)+" "+(svgY-sy+lastY),
				stroke: "transparent",
				"class": 'dependencyClickArea',
				"stroke-width": 7,
			}));
			$(path).data("clickable", $(clickable));
			$(clickable).data("path", $(path));
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
		/// Ensure we get a vector with an actual magnitude
		if (arrowVector[0]==0 && arrowVector[1]==0)  arrowVector[0]=1;

		/*
		To delete
		/// Find the shortest intersection in child to parent
		var arrowLine = $L([parX, parY], arrowVector);
		var childLines = draw.getSegments(child);
		var currentDist = Number.MAX_VALUE;
		for (var childLine of childLines) {
			intersectPoint = arrowLine.intersectionWith(childLine);
			var dist = Math.sqrt(Math.pow(intersectPoint.e(1)-parX,2) + Math.pow(intersectPoint.e(2)-parY,2));
			if (dist < currentDist) {
				currentDist = dist;
				currentPoint = {x: intersectPoint.e(1), y: intersectPoint.e(2)};
			}
		}

		var parLines = draw.getSegments(par);
		var currentDist = Number.MAX_VALUE;
		for (var parLine of parLines) {
			intersectPoint = arrowLine.intersectionWith(parLine);
			if (intersectPoint!=null) {
				var dist = Math.sqrt(Math.pow(intersectPoint.e(1)-childX,2) + Math.pow(intersectPoint.e(2)-childY,2));
				if (dist < currentDist) {
					currentDist = dist;
					currentPoint = {x: intersectPoint.e(1), y: intersectPoint.e(2)};
				}
			}
		}
		*/

		/// These run from 0 to 2PI. The "origin" line starts at about 135 degrees on a typical X-Y plane and moves anti-clockwise
		var angleBetweenDiags = draw.getAngle([-diagVector[0], -diagVector[1]], [-diagVector[0], diagVector[1]]);
		var angleBetween = draw.getAngle([-diagVector[0], -diagVector[1]], arrowVector);
		//onsole.debug("X:", diagVector, arrowVector, angleBetweenDiags, angleBetween);
		var parIntersect = null;
		var parSegment = null;
		if (angleBetween < angleBetweenDiags) {
			var p1 = $L([parX, parY], arrowVector),
				p2 = $L([par.x,par.y], [0,1]);
			parIntersect = p1.intersectionWith(p2);
			// The 0s are to make sylvester.js happy
			parSegment = [[par.x,par.y,0],[par.x,par.y+par.height,0]];
			// 0=topleft,1=topright,2=bottomright,3=bottomleft
			parSegment.corners = [0,3];
		}
		else if (angleBetween < Math.PI) {
			var p1 = $L([parX, parY], arrowVector),
				p2 = $L([par.x+par.width,par.y+par.height], [1,0]);
			parIntersect = p1.intersectionWith(p2);
			parSegment = [[par.x,par.y+par.height,0],[par.x+par.width,par.y+par.height,0]];
			parSegment.corners = [3,2];
		}
		else if (angleBetween < Math.PI + angleBetweenDiags) {
			var p1 = $L([parX,parY], arrowVector),
				p2 = $L([par.x+par.width,par.y+par.height], [0,1]);
			parIntersect = p1.intersectionWith(p2);
			parSegment = [[par.x+par.width,par.y,0],[par.x+par.width,par.y+par.height,0]];
			parSegment.corners = [1,2];
		}
		else {
			var p1 = $L([parX, parY], arrowVector),
				p2 = $L([par.x,par.y], [1,0]);
			parIntersect = p1.intersectionWith(p2);
			parSegment = [[par.x,par.y,0],[par.x+par.width,par.y,0]];
			parSegment.corners = [0,1];
		}

		/// In the coordinate space of the center point
		var diagVector = [child.width/2, child.height/2];
		var arrowVector = [parX - childX, parY - childY];
		/// Ensure we get a vector with an actual magnitude
		if (arrowVector[0]==0 && arrowVector[1]==0)  arrowVector[0]=1;
		/// These run from 0 to 2PI. The "origin" line starts at about 135 degrees on a typical X-Y plane and moves anti-clockwise
		var angleBetweenDiags = draw.getAngle([-diagVector[0], -diagVector[1]], [-diagVector[0], diagVector[1]]);
		var angleBetween = draw.getAngle([-diagVector[0], -diagVector[1]], arrowVector);
		//onsole.debug("X:", diagVector, arrowVector, angleBetweenDiags, angleBetween);
		var childIntersect = null;
		if (angleBetween < angleBetweenDiags) {
			var p1 = $L([childX, childY], arrowVector),
				p2 = $L([child.x,child.y], [0,1]);
			childIntersect = p1.intersectionWith(p2);
			// The 0s are to make sylvester.js happy
			childSegment = [[child.x,child.y,0],[child.x,child.y+child.height,0]];
			// 0=topleft,1=topright,2=bottomright,3=bottomleft
			childSegment.corners = [0,3];
		}
		else if (angleBetween < Math.PI) {
			var p1 = $L([childX, childY], arrowVector),
				p2 = $L([child.x+child.width,child.y+child.height], [1,0]);
			childIntersect = p1.intersectionWith(p2);
			childSegment = [[child.x,child.y+child.height,0],[child.x+child.width,child.y+child.height,0]];
			childSegment.corners = [3,2];
		}
		else if (angleBetween < Math.PI + angleBetweenDiags) {
			var p1 = $L([childX,childY], arrowVector),
				p2 = $L([child.x+child.width,child.y+child.height], [0,1]);
			childIntersect = p1.intersectionWith(p2);
			childSegment = [[child.x+child.width,child.y,0],[child.x+child.width,child.y+child.height,0]];
			childSegment.corners = [1,2];
		}
		else {
			var p1 = $L([childX, childY], arrowVector),
				p2 = $L([child.x,child.y], [1,0]);
			childIntersect = p1.intersectionWith(p2);
			childSegment = [[child.x,child.y,0],[child.x+child.width,child.y,0]];
			childSegment.corners = [0,1];
		}

		/// Handle rounded borders
		function getRoundedIntersect(intersectPoint, box, segment) {
			var boxMidX = box.x + box.width/2;
			var boxMidY = box.y + box.height/2;

			var distEnd1 = intersectPoint.distanceFrom( $V(segment[0]) );
			var distEnd2 = intersectPoint.distanceFrom( $V(segment[1]) );
			var corner = null;
			if (distEnd1 < box.borderRadius) {
				corner = segment.corners[0];
			}
			else if (distEnd2 < box.borderRadius) {
				corner = segment.corners[1];
			}
			if (corner!==null) {
				var m = arrowVector[0]!=0 ? arrowVector[1]/arrowVector[0] : null;
				var c = m===null ? boxMidX : boxMidY - m*boxMidX;
				var r = box.borderRadius;
				var cx = 0;
				var cy = 0;
				if      (corner == 0) { cx = box.x+r; cy = box.y+r; }
				else if (corner == 1) { cx = box.x+box.width-r; cy = box.y+r; }
				else if (corner == 2) { cx = box.x+box.width-r; cy = box.y+box.height-r; }
				else if (corner == 3) { cx = box.x+r; cy = box.y+box.height-r; }

				//onsole.log([m, c, r, cx, cy, corner].join(", "));
				/// We need to invert corner, because intersectLineCircle assumes standard Cartesian
				/// orientation (y gets bigger going up), but screen coordinates have y getting bigger
				/// going down.
				var inter = draw.intersectLineCircle(m, c, r, cx, cy, (3-corner)%4);
				return $V(inter);
			}
			return intersectPoint;
		}
		if (par.borderRadius) {
			parIntersect = getRoundedIntersect(parIntersect, par, parSegment);
		}
		if (child.borderRadius) {
			childIntersect = getRoundedIntersect(childIntersect, child, childSegment);
		}
		/*if (par.borderRadius) {
			var distEnd1 = parIntersect.distanceFrom( $V(parSegment[0]) );
			var distEnd2 = parIntersect.distanceFrom( $V(parSegment[1]) );
			//onsole.log(parIntersect, parSegment);
			var corner = null;
			if (distEnd1 < par.borderRadius) {
				//olor = "red";
				corner = parSegmentLocs[0];
			}
			else if (distEnd2 < par.borderRadius) {
				//olor = "red";
				corner = parSegmentLocs[1];
			}
			if (corner!==null) {
				var m = arrowVector[0]!=0 ? arrowVector[1]/arrowVector[0] : null;
				var c = m===null ? parX : parY - m*parX;
				var r = par.borderRadius;
				var cx = 0;
				var cy = 0;
				if      (corner == 0) { cx = par.x+r; cy = par.y+r; }
				else if (corner == 1) { cx = par.x+par.width-r; cy = par.y+r; }
				else if (corner == 2) { cx = par.x+r; cy = par.y+par.height-r; }
				else if (corner == 3) { cx = par.x+par.width-r; cy = par.y+par.height-r; }

				//onsole.log([m, c, r, cx, cy, corner].join(", "));
				var inter = draw.intersectLineCircle(m, c, r, cx, cy, (corner+2)%4);
				parIntersect = $V(inter);
			}
		}*/

		/// If we've been given a path, just update the d attribute
		if ($(outputEl)[0].tagName.toUpperCase() == "PATH") {
			var p = {x: parIntersect.e(1), y: parIntersect.e(2)}, c = {x: childIntersect.e(1), y: childIntersect.e(2)};
			var path = $(outputEl).attr("d", "M "+p.x+" "+p.y+" L "+c.x+" "+c.y);
			var $clickable = $(path).data('clickable');
			if ($clickable) {
				$clickable.attr("d", "M "+p.x+" "+p.y+" L "+c.x+" "+c.y);
			}
		}
		else {
			var path = $(draw.drawArrow(outputEl, {x: parIntersect.e(1), y: parIntersect.e(2)}, {x: childIntersect.e(1), y: childIntersect.e(2)}));
		}

		/*path.css('stroke', 'black');
		if (color)  path.css('stroke', color);*/

		return path;
	},
	getQuadrant: function(x, y) {
		/// Real quadrants in comment below. I've arbitrarily
		/// assigned quadrants to points falling on axes. (i.e. the 'x' in
		/// the comments.)
		var table = [
			[0, 0, 1],  // 0 x 1
			[3, 1, 1],  // x x x
			[3, 2, 2],  // 3 x 2
		];

		return table[-Math.sign(y)+1][Math.sign(x)+1];
	},
	/// Assumes quadrant symmetry. e.g.:
	///  \/
	///  /\
	getDiagonalQuadrant: function(x, y, diagVector) {
		var q = this.getQuadrant(x, y);
		var diagGrad = diagVector[1]/diagVector[0];
		diagGrad = q%2==0 ? -diagGrad : diagGrad;
		var lineGrad = y/x;
		var whichHalf = Number(Math.abs(lineGrad) > Math.abs(diagGrad));
		var table = [
			[3,1,1,3],
			[0,0,2,2],
		];
		return table[whichHalf][q];
	},
	/// m,c for line (y=mx + c)
	/// r, cx, cy for circle (r = (y-cy)**2 + (x-cx)**2)
	/// If line is vertical (i.e. m is infinite/undefined), pass in m=null
	/// and c=x coordinate of vertical line.
	/// quadrant refers to the circle quadrants
	intersectLineCircle: function(m, c, r, cx, cy, quadrant) {
		var {pow, sqrt} = Math;
		/// Specify line in coordinate space of circle (m stays same)
		var c2 = (c-cy) - m*(-cx);
		/// Handle special case, where m is undefined (or, rather, infinite)
		var valid = false;
		var x1, x2, y1, y2;
		if (m===null) {
			x1 = c2;
			x2 = c2;
			if (r > x1) {
				valid = true;

				y1 = sqrt(pow(r,2) - pow(x1,2)) + cy;
				y2 = 2*cy - y1;
			}
		}
		else {
			var discriminant = 4*pow(r,2)*(pow(m,2)+1) - 4*pow(c2,2);
			if (discriminant > 0) {
				valid = true;

				x1 = (-2*m*c2 + Math.sqrt(discriminant))/(2*pow(m,2)+2) + cx;
				x2 = (-2*m*c2 - Math.sqrt(discriminant))/(2*pow(m,2)+2) + cx;

				y1 = x1*m + c;
				y2 = x2*m + c;
			}
		}
		if (!valid) {
			return null;
		}
		else if (draw.getQuadrant(x1-cx, y1-cy) === quadrant) {
			return [x1, y1];
		}
		else if (draw.getQuadrant(x2-cx, y2-cy) === quadrant) {
			return [x2, y2];
		}
		else {
			return [[x1,y1],[x2,y2]];
		}
	},
	/// This is not very generalised...
	setProbBackground: function($td) {
		var valStr = $td.find(".prob").text();

		if (valStr.search(/^\s*(0|1|0?\.\d+)\s*/)!=-1) {
			var v = parseFloat(valStr);
			if (v >= 0 && v <= 1) {
				var n = $td.closest('tr')[0].rowIndex % 2;
				$td.css("background-image",
					"linear-gradient(to top,var(--cpt-background"+n+"),"+toPercent(v)+",var(--cpt-background"+n+"),"+toPercent(v)+",transparent)");
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
		var start = performance.now();
		function displayPerf(totalIterationsRun) {
			var durationMs = (performance.now() - start);
			if ($(".status .duration").length==0) {
				$(".status").append("<span class=duration title='Time taken for last computation'>Last: <span class=val></span>ms</span>");
			}
			$(".status .duration .val").text(Math.round(durationMs*1000)/1000);
			if (totalIterationsRun) {
				if ($(".status .iterations").length==0) {
					$(".status").append('<span class=iterations title="Number of iterations for last computation">Iterations: <span class=val></span></span>');
				}
				$(".status .iterations .val").text(totalIterationsRun);
			}

		}
		if (this.useWorkers) {
			this.updateBeliefs_worker(function(bn, totalIterationsRun) {
				bn.displayBeliefs(outputEl);
				displayPerf(totalIterationsRun);
				if (callback)  callback(bn);
			});
		}
		else {
			this.updateBeliefs();
			this.displayBeliefs(outputEl);
			displayPerf();
			if (callback)  callback(this);
		}
	},
	displayBeliefs: function(outputEl) {
		outputEl = outputEl || this.outputEl;
		/// If any node needs to update display, update the full display
		/// (in case layout has changed)
		for (var node of this.nodes) {
			if (node._updateDisplay)  this.display(outputEl);
		}
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
		if (!outputEl)  outputEl = this.outputEl = $('.bnview');
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
				$("<div class='submodel parent item'>..</div>")
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
				$(path).data('arcSelector', new ArcSelector($(path)));
				graphItem.pathsIn[j].pathId = pathId;
				parentItem.pathsOut[graphItem.pathsIn[j].pathOutIndex].pathId = pathId;
				/// And ... we need to specify the endpoints for this path
				$(path).data('endpoints', [parentItem, graphItem]);
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

		/// Not sure this belongs here. I'm thinking |display()| should just be
		/// responsible for displaying the BN graph, not associated extras
		if (bn.updateViewer) {
			$(".status").html('<span class=numNodes>'+bn.nodes.length+" nodes</span>");
			bn.showComment();
			document.title = bn.fileName + " - " + titlePostfix;
			app.makeEvidenceMenu(bn.evidenceSets);
		}

		/// Updated, so not needed any more
		bn.updateViewer = false;
	},
	redrawArcs: function(graphItems, width, height) {
		if (!Array.isArray(graphItems))  graphItems = [graphItems];
		var arcsDone = {};
		var maxX = width;
		var maxY = height;
		for (var gi=0; gi<graphItems.length; gi++) {
			var graphItem = graphItems[gi];
			var $graphItem = this.outputEl.find("#display_"+graphItem.id);

			/// Update max x/y as extents for canvas if necessary
			var b = draw.getBox($graphItem);
			maxX = Math.max(maxX, b.x+b.width);
			maxY = Math.max(maxY, b.y+b.height);
			if (maxX != width || maxY != height) {
				$(".netSvgCanvas").attr("width", maxX).attr("height", maxY);
			}

			for (var i=0; i<graphItem.pathsIn.length; i++) {
				if (arcsDone[graphItem.pathsIn[i].pathId])  continue;
				var $parent = $('#display_'+graphItem.pathsIn[i].parentItem.id);
				draw.drawArrowBetweenBoxes($("#"+graphItem.pathsIn[i].pathId), draw.getBox($parent), draw.getBox($graphItem));
				arcsDone[graphItem.pathsIn[i].pathId] = true;
			}
			for (var i=0; i<graphItem.pathsOut.length; i++) {
				if (arcsDone[graphItem.pathsOut[i].pathId])  continue;
				var $child = $('#display_'+graphItem.pathsOut[i].childItem.id);
				draw.drawArrowBetweenBoxes($("#"+graphItem.pathsOut[i].pathId), draw.getBox($graphItem), draw.getBox($child));
				arcsDone[graphItem.pathsOut[i].pathId] = true;
			}
		}

		return {maxX, maxY};
	},
	/// Given a DOM element, find appropriate associated item
	findItem: function(el) {
		var $el = $(el).closest('.node, .submodel, .textBox');
		if ($el.length) {
			var id = $el[0].id.replace(/^display_/, '');
			return currentBn.getGraphItemById(id);
		}
		return null;
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
	showComment: function(doShow, {force} = {force:false}) {
		var bn = this;
		doShow = doShow===undefined ? true : doShow;
		if (doShow) {
			$(".sidebar").empty();
			$(".sidebar").append($("<div class=close><button type=button onclick='currentBn.showComment(false)'>X</button></div>"));
			var hasChanges = false;
			$(".sidebar").append(
				$("<div class=comment contenteditable=true>")
					.text(this.comment)
					/// Clearing all text doesn't necessarily make div empty.
					/// This fixes that.
					.on('input', function(event) {
						if ($(this).text().trim()=="") {
							$(this).text('');
						}
						hasChanges = true;
					})
					/// Update BN description on change
					.on('blur', function(event) {
						if (hasChanges) {
							hasChanges = false;
							console.log('xx');
							var newComment = $(this).text();
							bn.changes.addAndDo({
								oldComment: bn.comment,
								newComment: newComment,
								exec(comment) {
									bn.comment = comment;
									$('.comment').text(comment);
								},
								undo() { this.exec(this.oldComment) },
								redo() { this.exec(this.newComment) },
							});
						}
					})
			);
			$(".sidebar").animate({width:this.comment || force?'show':'hide'},350);
		}
		else {
			$(".sidebar").animate({width:'hide'},350);
		}
	},
	/**
		This is still to be fleshed out, in terms of how it will work.
	*/
	find: function(ref) {
		if (typeof(ref)=="string") {
			return this.nodesById[ref];
		}
		else if (ref.attr && ref.attr('id')) {
			var id = ref.attr('id').replace(/^display_/, '');
			return this.nodesById[id];
		}
	},
	clearSelection: function() {
		for (var item of this.selected) {
			item.guiToggleSelect({off:true});
		}
	},
	selectAll: function() {
		for (var node of currentBn.nodes) {
			node.guiToggleSelect({on:true});
		}
	},
	/// random name. I should be using proper prototypal inheritance...
	_suhfac_SetEvidence: BN.prototype.setEvidence,
	setEvidence: function(evidence, o) {
		this._suhfac_SetEvidence(evidence, o);
		
		/// Update GUI
		$('.bnview .hasEvidence').removeClass('hasEvidence');
		for (var node in evidence) {
			$(`.bnview #display_${node}`).addClass('hasEvidence');
		}
		currentBn.updateAndDisplayBeliefs();
		
		return this;
	},
});
Submodel.prototype = $.extend(Submodel.prototype, {
	displayItem: function(outputEl, $displayNode) {
		var submodel = this;
		if (!$displayNode) {
			$displayNode = $("<div class='submodel item' id=display_"+submodel.id+" draggable=true>")
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
			MenuAction("<label>Submodel:</label> <input type=text data-control=submodelPath class=submodelPath value='"+toHtml(node.getSubmodelPathStr())+"'>", function() { }),
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
				node.setSubmodelPath(val);
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
			$displayNode = $("<div class='node item' id=display_"+node.id+" draggable=true>")
				.css({left: node.pos.x+"px", top: node.pos.y+"px"})
				.append(
					$('<div class=controlBar>').append(
						$("<h6>").text(node.net.headerFormat(node.id, node.label)),
						$('<div class=hotSpotParent><div class=hotSpot draggable=true></div></div>')
					)
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
		if (node.net.evidence[node.id]!==undefined)  $displayNode.addClass('hasEvidence');
		$displayNode.addClass(node.type);
		/// Clear out any existing states first
		$displayNode.find(".state").remove();
		for (var j=0; j<node.states.length; j++) {
			var state = node.states[j];
			$displayNode.append(
				$("<div class=state>").append(
					$("<div class=stateName>").attr("data-index", state.index).text(state.id)
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
	_prepTable: function(type) {
		var node = this;
		var str = "<table class="+type+">";
		var npc = node.numParentCombinations();
		var parentIndexes = setupIndexes(node.parents);
		/// Write out header
		str += '<tr>';
		for (var i=0; i<node.parents.length; i++) {
			str += '<th>'+toHtml(node.parents[i].id)+'</th>';
		}
		str += '</tr>'
		/// Write out each row
		for (var i=0; i<npc; i++) {
			str += '<tr>';
			/// List all parents on the side (Netica style)
			for (var k=0; k<node.parents.length; k++) {
				var parent = node.parents[k];
				str += "<th>"+toHtml(parent.states[parentIndexes[k]].id)+"</th>";
			}
			nextCombination(node.parents, parentIndexes);
			str += '</tr>';
		}
		str += '</table>';
		return $(str);
	},
	makeCptHtml: function(cptOnly) {
		var node = this;
		
		function addStateHeader($tr, id) {
			$tr.append(
				n('th.stateLabel',
					n('span.stateId', {'data-control': 'state', 'contenteditable': 'true'}, id)
				)
			);
			/*$tr.append('<th class=stateLabel><span class=stateId data-control=state contenteditable>'+toHtml(id)+'</span></th>');*/
		}

		function addStateEntry($tr, prob) {
			var $td = $("<td>")
				.append("<span class=prob contenteditable data-control=cpt>"+toChance(sigFig(prob,3))+"</span>");
			$tr.append($td);
			draw.setProbBackground($td);
		}

		function addStateColumn(id) {
			addStateHeader($('.dialog .def .stateId:first').closest('tr'), id);
			$('.dialog .def td:last-child .prob').each(function() {
				addStateEntry($(this).closest('tr'), 0);
			});
		}

		function removeStateColumn(stateNum) {
			var cellI = $('.dialog .def .stateId').eq(stateNum).closest('th')[0].cellIndex;
			$('.dialog .def tr th:nth-child('+(cellI+1)+'), .dialog .def tr td:nth-child('+(cellI+1)+')').remove();
		}

		/// Setup the table DOM
		var $table = node._prepTable("cpt");
		var $tr = $table.find("tr:eq(0)");
		/// Track last cpt entry that had the focus
		var probFocused = null;
		for (var j=0; j<node.states.length; j++) {
			addStateHeader($tr, node.states[j].id);
		}
		for (var i=0; i<$table[0].rows.length-1; i++) {
			var row = node.def.getRow(i);
			var $tr = $table.find("tr:eq("+(i+1)+")");
			/// Now list the distro for each row
			for (var j=0; j<row.length; j++) {
				addStateEntry($tr, row[j]);
			}
		}

		if (cptOnly) {
			return $table;
		}

		/// Function for setup of table events
		function addEvents($def) {
			$def.on("input", ".prob", function() {
					draw.setProbBackground($(this).closest("td"));
					/// This row was possibly set to invalid. Clear, if any change made
					$(this).closest("tr").removeClass("invalid");
				}).on("focus", ".prob", function() {
					probFocused = this;
				}).on("input", "th span", function() {
					var stateI = $(this).closest('th')[0].cellIndex - node.parents.length;
					console.log("stateI:", stateI);
					node.renameStates( {[stateI]: this.innerText} );
				}).on('keypress', 'th span', function(event) {
					if (event.ctrlKey && ['ArrowLeft','ArrowRight'].includes(event.key)) {
						var dir = event.key == 'ArrowLeft' ? -1 : 1;
						var $table = $(this).closest('table');
						var $th = $(this).closest('th');
						var colI = $th[0].cellIndex;
						var stateI = colI - node.parents.length;

						var otherStateI = Math.min(Math.max(stateI + dir,0),node.states.length);
						if (otherStateI != stateI) {
							$table.find('tr').each(function() {
								var $cell = $(this).find(`> :nth(${node.parents.length+stateI})`);
								var $otherCell = $(this).find(`> :nth(${node.parents.length+otherStateI})`);
								if (dir == -1)  $otherCell.before($cell);
								else            $otherCell.after($cell);
							});
						}
						$th.find('span').focus();
						/// Going to cheat here, and do the state move immediately
						/// XXX: Fix, and only execute states moves on clicking 'Save'.
						/// (This is actually very annoying to do, particularly when combined with things
						/// like state renames and state additions/deletions.)
						node.nodeOrig.moveStates( {[stateI]: otherStateI} );
						/// Update displayed node immediately
						var $state = $(`#display_${node.nodeOrig.id} .state:nth(${stateI})`);
						var $otherState = $(`#display_${node.nodeOrig.id} .state:nth(${otherStateI})`);
						if (dir == -1)  $otherState.before($state);
						else            $otherState.after($state);
						$state.find('.stateName').attr('data-index', otherStateI);
						$otherState.find('.stateName').attr('data-index', stateI);
					}
				});
		}

		/// Make toolbar buttons
		var toolbarButtons = [
			$('<button>').text('+State').on('click',function() {
				node.addStates(['state'+node.states.length], {updateChildren: false});
				console.log(node.states, node.statesById);
				addStateColumn('state'+node.states.length);
				//$('.dialog .def').html(node.makeCptHtml(true));
				/// Make sure state list and CPT updated
				$('.dialog .def .stateId, .dialog .def .prob').trigger('change');
			}),
			$('<button>').text('-State').on('click',function() {
				console.log("focussed:", probFocused);
				var stateNum = $(probFocused).closest('td')[0].cellIndex - node.parents.length;
				node.removeStates([stateNum], {updateChildren: false});
				removeStateColumn(stateNum);
				//$('.dialog .def').html(node.makeCptHtml(true));
				/// Make sure state list and CPT updated
				$('.dialog .def .stateId, .dialog .def .prob').trigger('change');
			})
		];

		return [$table,toolbarButtons,addEvents];
	},
	makeFuncTableHtml: function() {
		var node = this;
		var $table = node._prepTable("funcTable");
		var $tr = $table.find("tr:eq(0)");
		$tr.append('<th class=funcState>State</th>');
		var values = node.def.funcTable;
		if (node.type == "utility") {
			values = node.utilities;
		}
		for (var i=0; i<$table[0].rows.length-1; i++) {
			var $tr = $table.find("tr:eq("+(i+1)+")");
			/// Now list the state for each row
			if (node.type=="utility") {
				var $td = $("<td>")
					.append("<span class=state contenteditable data-control=funcTable>"+toHtml(values[i])+"</span>");
			}
			else {
				/// At this stage, funcTable that isn't a utility is always a conditional state table.
				/// In the future, the value could end up being the value of the node, I suppose.
				var $select = $('<select class=state data-control=funcTable>');
				for (var j=0; j<node.states.length; j++) {
					var $opt = $('<option>').attr('value', j).text(node.states[j].id);
					if (values[i]==j)  $opt.attr('selected', '');
					$select.append($opt);
				}
				var $td = $("<td>")
					.append($select);
			}
			$tr.append($td);
		}
		return [$table,null,null];
	},
	makeFuncTextHtml: function() {
		var node = this;
		console.log(node);
		return [$('<textarea data-control=funcText>').val(node.def.funcText.replace(/^(\s*)([a-zA-Z0-9_]+)/, '$1'+node.id)),null,null];
	},
	makeContextOptions: function() {
		var node = this;
		var options = [];
		var possTypes = ['Nature','Decision','Utility'];
		for (var i=0; i<possTypes.length; i++) {
			options.push($("<option>").text(possTypes[i]));
			if (node.type == possTypes[i].toLowerCase()) {
				options[options.length-1].attr("selected","selected");
			}
		}
		var $nodeType = $("<select data-control=nodeType>")
			.append(options)
			.on('change keyup', function() {
				node.type = this.value;
			});

		var menu = Menu({type: "embedded", items: [
			MenuAction("<label>Node ID:</label> <input type=text data-control=nodeId class=nodeId value='"+toHtml(node.id)+"' pattern='[a-zA-Z_][a-zA-Z_0-9]*'>", function() { }),
			MenuAction("<label>Label:</label> <input type=text data-control=nodeLabel class=nodeLabel value='"+toHtml(node.label)+"'>", function() { }),
			MenuAction("<label>Type:</label> "+$nodeType[0].outerHTML, function() { }),
			MenuAction("<label>Submodel:</label> <input type=text data-control=submodelPath class=submodelPath value='"+toHtml(node.getSubmodelPathStr())+"' pattern='[/a-zA-Z_0-9]*'>", function() { }),
			MenuAction("Delete...", function() { node.guiDelete(); }),
			MenuAction("<div class=commentSec><label>Comment:</label><textarea class=comment data-control=comment>"+toHtml(node.comment)+"</textarea></div>", function(){}),
		]});
		return menu.make()
			.on('change keyup', '.nodeId', function() {
				if (node.id == node.label) {
					node.label = this.value;
					$(this).closest('.menu').find('.nodeLabel').val(node.label);
					$(this).closest('.dialog').data('whatsDirty').nodeLabel = true;
				}
				node.id = this.value;
			});
	},
	makeContextDefinition: function() {
		var node = this;
		var $defType = $("<div class=defType>");
		var $def = $("<div class=def>");
		var $defSection = null;
		var $toolbar = null;

		if (node.def.type == 'CPT') {
			[$defSection,$toolbar,addEvents] = this.makeCptHtml();
		}
		else if (node.def.type == 'Equation') {
			/// XXX: Finish adding the tab set to the context menu popup
			[$defSection,$toolbar,addEvents] = node.makeFuncTextHtml();
		}
		else if (node.def.type == 'CDT') {
			[$defSection,$toolbar,addEvents] = this.makeFuncTableHtml();
		}

		if (node.type == "nature") {
			console.log(node.type);
			$defType.append(
				$('<div class="toolbar defToolbar">').append(
					//$('<label>').text('Definition Type: '),
					$('<select data-control=definitionType class=definitionType>').append([['CPT','Probability Table'],['CDT','Deterministic Table'],['Equation','Equation']].map(function(a){
						var $opt = $('<option>').text(a[1]).attr("value", a[0]);
						if (node.def.type == a[0])  $opt.attr('selected','');
						return $opt;
					})).on('change keyup', function () {
						/// Restore just the definition variables from the original each time
						/// Creating duplicate is easiest way to create dups of cpts, funcTables, etc.
						node.def = node.nodeOrig.def.duplicate();
						console.log('NODETYPE:', $(this).val());
						node.setDefinitionType($(this).val());
						var $def = null;
						if (node.def.type == 'CPT') {
							[$def,$toolbar] = node.makeCptHtml();
						}
						else if (node.def.type == 'CDT') {
							[$def,$toolbar] = node.makeFuncTableHtml();
						}
						else if (node.def.type == 'Equation') {
							// ID needs to be correct when generating the display
							[$def,$toolbar] = node.makeFuncTextHtml();
						}
						$('.dialog .def').html($def);
						$defType.find('.defToolbar .typeSpecific').html($toolbar);
					}),
					$('<span class=typeSpecific>').html($toolbar)
				)
			);
		}
		if (typeof(addEvents)=="function") {
			addEvents($def);
		}
		$def.append($defSection);

		return $("<div>").append($defType, $def);
	},
	makeContextFormat: function() {
		var node = this;
		var formatMenu = Menu({type: "embedded", items: [
			MenuAction("<label>Background Color:</label> <input type=text data-control=backgroundColor class=backgroundColor value='"+toHtml(node.format.backgroundColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("<label>Border Color:</label> <input type=text data-control=borderColor class=borderColor value='"+toHtml(node.format.borderColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("<label>Text Color:</label> <input type=text data-control=textColor class=textColor value='"+toHtml(node.format.fontColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("<label>Font Family:</label> <input type=text data-control=fontFamily class=fontFamily value='"+toHtml(node.format.fontFamily)+"' placeholder='[default]'>", function() { }),
			MenuAction("<label>Font Size:</label> <input type=text data-control=fontSize class=fontSize value='"+toHtml(node.format.fontSize)+"' pattern='[0-9]*' placeholder='[default]'>", function() { }),
		]});
		return formatMenu.make();
	},
	/// This is the context menu for any ordinary node visible on the canvas. It has a set
	/// of tabs that change based on the type of node. (e.g. CPT tab is displayed for
	/// discrete chance nodes, while function text is displayed for equation/continuous nodes)
	contextMenu: function() {
		var node = this;

		var whatsDirty = {cpt: false, funcText: false, nodeId: false, comment: false};

		/// Create a duplicate of the node, which will be changed while
		/// the settings dialog is open.
		var nodeDup = node.duplicate(node.id, null, true);
		/// Keep pointer to original, as sometimes need it
		nodeDup.nodeOrig = node;

		/** Options **/
		var $options = $('<div class=options>');
		$options.html(nodeDup.makeContextOptions());
		/** End options **/

		var defTab = null;

		/** Definition **/
		var $defTabContent = $('<div class=defTabContent>');
		function makeDefTab() { $defTabContent.html(nodeDup.makeContextDefinition()); }
		//makeDefTab();

		/** Format **/
		var $format = $('<div class=format>');
		$format.append(nodeDup.makeContextFormat());

		var tabs = new TabSet([
			{id: 'main',       label: 'Options',    content: $options, active: true},
			{id: 'definition', label: 'Definition', content: $defTabContent,   onselect: makeDefTab},
			{id: 'format',     label: 'Format',     content: $format},
		]);
		tabs.$tabs.on('keypress', '*[data-control=cpt]', function(event) {
			var $target = $(event.target).closest('[data-control=cpt]');
			var $row = $target.closest('tr');
			console.log('x',event.keyCode,event.which);
			if (event.key == 'F1') {
				console.log('norm');
				var distro = $row.find('[data-control=cpt]').toArray().map(a=>Number($(a).text()));
				distro = normalize(distro);
				$row.find('[data-control=cpt]').each(function(i) {
					$(this).text(toChance(sigFig(distro[i],3)));
				});
				$row.find('[data-control=cpt]').trigger('keyup');
				return false;
			}
			else if (event.key == 'F2') {
				console.log('fill');
				var partialDistro = $row.find('[data-control=cpt]').not($target).toArray().map(a=>Number($(a).text()));
				var partialSum = partialDistro.reduce((c,v)=>c+v);
				console.log(partialDistro, partialSum);
				$target.text(toChance(sigFig(Math.max(1 - partialSum,0),3)));
				$row.find('[data-control=cpt]').trigger('keyup');
				return false;
			}
			/// If user types a '.' after some numbers that aren't just '0', switch to the next cell automatically
			else if (event.key == ".") {
				if ($target.text().trim().length > 0 && $target.text().trim()!="0") {
					console.log(event.which,$target.text().trim());
					var range = window.getSelection().getRangeAt(0);
					//return false;
					if (range.collapsed && range.startOffset == $target.text().length) {
						/// Find next cell
						var $nextTd = $target.closest('td').next();
						var $nextEl = null;
						if ($nextTd.length) {
							$nextEl = $nextTd.find('[data-control=cpt]');
						}
						else {
							var $nextTd = $target.closest('tr').next().find('td:first');
							if ($nextTd.length) {
								$nextEl = $nextTd.find('[data-control=cpt]');
							}
						}
						if ($nextEl) {
							$nextEl.text('.');
							$nextEl.focus();
							return false;
						}
					}
				}
			}
		}).on('blur', '*[data-control=cpt]', function(event) {
			console.log('cpt blur');
			/// Only listen for change events
			if ($(this).text()!=$(this).data('originalValue')) {
				console.log('cpt change');
				var $target = $(event.target).closest('[data-control=cpt]');
				var $row = $target.closest('tr');
				/// If we entered 1 into this cell,
				/// automatically zero everything else, and advance to next row
				if ($(this).text()==1) {
					var $nextTd = $row.next().find('td:first [data-control=cpt]');
					$row.find('td [data-control=cpt]').each(function() {
						if ($(this).text()!=1) {
							$(this).text(0).trigger('change');
						}
					});
					/*console.log($(':focus'), $row);
					if ($(document.activeElement).closest('tr').is($row)) {
						$nextTd.focus();
					}*/
					//return false;
				}
			}
		}).on('focus', '*[data-control=cpt]', function(event) {
			$(this).data('originalValue', $(this).text());
			if ($(event.target).text()==".") {
				requestAnimationFrame(function(){
					var range = document.createRange();
					range.setStart(event.target.firstChild, 1);
					range.setEnd(event.target.firstChild, 1);
					var sel = window.getSelection();
					sel.removeAllRanges();
					sel.addRange(range);
					//range.setStart(event.target.firstChild, 0);
					//range.setEnd(event.target.firstChild, $(event.target).text().length);
				});
				return false;
			}
			console.log('focus');
			//event.target.firstChild.focus();
			requestAnimationFrame(function(){
				var range = document.createRange();
				range.selectNodeContents(event.target.firstChild);
				var sel = window.getSelection();
				sel.removeAllRanges();
				sel.addRange(range);
				//range.setStart(event.target.firstChild, 0);
				//range.setEnd(event.target.firstChild, $(event.target).text().length);
			});
			return false;
		});

		popupEditDialog(tabs.$tabs, {className: 'node',
			onsave: function() {
				/// Update the duplicate node
				node.duplicateInto(nodeDup);
			},
			controls: {
				backgroundColor: {change: function(val) {
					node.net.changes.addAndDo({
						net: node.net, nodeId: node.id,
						oldVal: node.format.backgroundColor, newVal: val,
						exec(changeTo) {
							var node = this.net.nodesById[this.nodeId];
							var $displayNode = $('#display_'+node.id);
							$displayNode.css('background-color', changeTo==null? '' : changeTo);
							node.format.backgroundColor = changeTo;
						},
						undo() { this.exec(this.oldVal); },
						redo() { this.exec(this.newVal); },
					});
				}},
				borderColor: {change: function(val) {
					node.net.changes.addAndDo({
						net: node.net, nodeId: node.id,
						oldVal: node.format.borderColor, newVal: val,
						exec(changeTo) {
							var node = this.net.nodesById[this.nodeId];
							var $displayNode = $('#display_'+this.nodeId);
							$displayNode.css('border-color', changeTo==null ? '' : changeTo);
							$displayNode.find('h6').css('border-color', changeTo==null ? '' : changeTo);
							node.format.borderColor = changeTo;
						},
						undo() { this.exec(this.oldVal); },
						redo() { this.exec(this.newVal); },
					});
				}},
				textColor: {change: function(val) {
					node.net.changes.addAndDo({
						net: node.net, nodeId: node.id,
						oldVal: node.format.fontColor, newVal: val,
						exec(changeTo) {
							var node = this.net.nodesById[this.nodeId];
							var $displayNode = $('#display_'+this.nodeId);
							$displayNode.css('color', changeTo==null ? '' : changeTo);
							node.format.fontColor = changeTo;
						},
						undo() { this.exec(this.oldVal); },
						redo() { this.exec(this.newVal); },
					});
				}},
				fontFamily: {change: function(val) {
					node.net.changes.addAndDo({
						net: node.net, nodeId: node.id,
						oldVal: node.format.fontFamily, newVal: val,
						exec(changeTo) {
							var node = this.net.nodesById[this.nodeId];
							var $displayNode = $('#display_'+this.nodeId);
							$displayNode.css('font-family', changeTo==null ? '' : changeTo);
							node.format.fontFamily = changeTo;
						},
						undo() { this.exec(this.oldVal); },
						redo() { this.exec(this.newVal); },
					});
				}},
				fontSize: {change: function(val) {
					node.net.changes.addAndDo({
						net: node.net, nodeId: node.id,
						oldVal: node.format.fontSize, newVal: val,
						exec(changeTo) {
							//onsole.log("changeTo", changeTo);
							var node = this.net.nodesById[this.nodeId];
							var $displayNode = $('#display_'+node.id);
							$displayNode.css('font-size', changeTo===null ? '' : changeTo+'pt');
							node.format.fontSize = changeTo;
						},
						undo() { this.exec(this.oldVal); },
						redo() { this.exec(this.newVal); },
					});
				}},
				submodelPath: {change: function(val) {
					node.net.changes.addAndDo({
						net: node.net, nodeId: node.id,
						oldVal: node.getSubmodelPathStr(), newVal: val,
						exec(changeTo) {
							var node = this.net.nodesById[this.nodeId];
							node.setSubmodelPath(changeTo);
							currentBn.display();
							currentBn.displayBeliefs();
						},
						undo() { this.exec(this.oldVal); },
						redo() { this.exec(this.newVal); },
					});
				}},
				nodeId: {change: function(val) {
					node.net.changes.addAndDo({
						node: node,
						oldId: node.id,
						newId: val,
						rename(toId) {
							console.log('renaming', $('#display_'+node.id), toId);
							var $displayNode = $('#display_'+node.id);
							$displayNode.attr("id", 'display_'+toId);
							node.rename(toId);
							$displayNode.find('h6').html(currentBn.headerFormat(node.id,node.label));
						},
						undo() {
							this.rename(this.oldId);
						},
						redo() {
							this.rename(this.newId);
						}
					});
				}},
				nodeLabel: {change: function(val) {
					node.net.changes.addAndDo({
						node: node,
						oldLabel: node.label,
						newLabel: val,
						relabel(toLabel) {
							var $displayNode = $('#display_'+this.node.id);
							this.node.label = toLabel;
							$displayNode.find('h6').html(currentBn.headerFormat(node.id,node.label));
						},
						undo() {
							this.relabel(this.oldLabel);
						},
						redo() {
							this.relabel(this.newLabel);
						}
					});
				}},
				nodeType: {change: function(val) {
					node.setType(val);
					currentBn.display();
					currentBn.updateAndDisplayBeliefs();
				}},
				definitionType: {change: function(val) {
					node.setDefinitionType(val);
					currentBn.display();
					currentBn.updateAndDisplayBeliefs();
				}},
				funcText: {change: function(val) {
					node.net.changes.addAndDo({
						net: node.net, nodeId: node.id,
						oldVal: node.funcText, newVal: val,
						exec(changeTo) {
							var node = this.net.nodesById[this.nodeId];
							node.def.set(changeTo);
							currentBn.updateAndDisplayBeliefs();
						},
						undo() { this.exec(this.oldVal); },
						redo() { this.exec(this.newVal); },
					});
				}},
				comment: {change: function(val) {
					/// XXX: It's not clear to me that this is the best
					/// way to do undo for text fields. However, the alternative
					/// is much more work to do. (For now.)
					node.net.changes.addAndDo({
						net: node.net, nodeId: node.id,
						oldVal: node.comment, newVal: $(".dialog textarea.comment").val(),
						exec(changeTo) {
							var node = this.net.nodesById[this.nodeId];
							node.comment = changeTo==null ? '' : changeTo;
						},
						undo() { this.exec(this.oldVal); },
						redo() { this.exec(this.newVal); },
					});
				}},
				cpt: {change: function(val) {
					var oldNode = node.duplicate(node.id, null, true);
					var newCpt = $(".dialog .prob").map(function() { return $(this).text(); }).toArray();
					/// XXX Lots to clean up and fix
					var invalid = false;
					var numRows = nodeDup.def.cpt.length/nodeDup.states.length;
					for (var r=0; r<numRows; r++) {
						var sum = 0;
						for (var c=0; c<nodeDup.states.length; c++) {
							console.log(r, c, nodeDup.states.length, r*nodeDup.states.length + c);
							sum += parseFloat(newCpt[r*nodeDup.states.length + c]);
						}
						console.log(r, sum, newCpt, nodeDup.states, nodeDup.def.cpt, node.def.cpt);
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
						node.net.changes.addAndDo({
							net: node.net, nodeId: node.id,
							oldStates: node.states.map(a=>a.id),
							oldCpt: node.def.cpt.map(a=>a),
							newStates: nodeDup.states.map(a=>a.id),
							newCpt: newCpt,
							exec(toStates, toCpt) {
								var statesChanged = false;
								if (node.states.length != toStates.length) {
									node.setStates(toStates);
									node.def.cpt = toCpt;

									statesChanged = true;
								}
								else {
									node.def.set1d(toCpt);
								}
								/// Do more efficient display update?
								/// XXX: Does this work properly with undo now?
								if (statesChanged) {
									for (var child of node.children) {
										/// Create a copy of how the child used to look
										var oldChild = child.duplicate(child.id, null, true);
										/// Sub back in the old parent
										for (var i=0; i<oldChild.parents.length; i++) {
											if (oldChild.parents[i].id == oldNode.id) {
												oldChild.parents[i] = oldNode;
											}
										}

										/// Update child definition
										child.updateDefinition({oldNode: oldChild});
									}
									currentBn.display();
								}
								currentBn.updateAndDisplayBeliefs();
							},
							undo() { this.exec(this.oldStates, this.oldCpt); },
							redo() { this.exec(this.newStates, this.newCpt); },
						});
					}
				}},
				funcTable: {change: function() {
					var newTable = $(".dialog .state").map(function() { return $(this).is('select') ? $(this).val() : $(this).text(); }).get();
					console.log(newTable);
					if (node.type == "utility") {
						node.setUtilities(newTable.map(v => parseFloat(v)));
					}
					else {
						node.def.set(newTable.map(v => parseInt(v)));
					}
					currentBn.display();
					currentBn.updateAndDisplayBeliefs();
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
			}
		});
	},
	guiDelete: function() {
		var node = this.nodeOrig ? this.nodeOrig : this;
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
	guiToggleSelect: function(o) {
		o = o || {};
		o.on = o.on || null;
		o.off = o.off || null;
		var bn = this.net;
		var nodeId = this.id;

		if (o.on !== true && o.off !== false && (bn.selected.has(this) || o.off === true)) {
			bn.selected.delete(this);
			$("#display_"+nodeId).removeClass("selected");
		}
		else {
			bn.selected.add(this);
			$("#display_"+nodeId).addClass("selected");
		}
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
			$displayNode = $("<div class='textBox item' id=display_"+node.id+" draggable=true>")
				.css({left: node.pos.x+"px", top: node.pos.y+"px"})
				.css({
					width: node.size.width==-1 ? null : (node.size.width+"px"),
					height: node.size.height==-1 ? null : (node.size.height+"px")
				})
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

class ArcSelector {
	constructor(p) {
		this.path = $(p)[0];
	}
	
	guiToggleSelect(o) {
		o = o || {};
		o.on = o.on || null;
		o.off = o.off || null;
		var [parent,child] = $(this.path).data('endpoints');
		var bn = parent.net;

		if (o.on !== true && o.off !== false && (bn.selected.has(this) || o.off === true)) {
			bn.selected.delete(this);
			this.path.classList.remove('selected');
		}
		else {
			bn.selected.add(this);
			this.path.classList.add('selected');
		}
	}
	
	delete() {
		var [parent,child] = $(this.path).data('endpoints');
		//onsole.log(parent.id, child.id);
		parent.removeChildren([child]);
	}
	
	contextMenu(event) {
		var menu = Menu({type: 'contextMenu', items: [
			MenuAction('Delete', () => {
					this.delete();
					$('.contextMenu').remove(); 
					currentBn.display();
					currentBn.updateAndDisplayBeliefs();
			}),
		]});
		menu.popup({left:event.clientX, top:event.clientY});
	}
}


var app = {
	newFile: function() {
		currentBn = new BN({filename: `bn${++guiBnCount}.xdsl`});
		currentBn.display();
	},
	loadFile: async function() {
		if (stormy.available) {
			var file = await stormy.openFileDialog();
			openBns.push(new BN({source: file.text, outputEl: $(".bnview"), format: file.format, fileName: file.fileName}));
			currentBn = openBns[openBns.length-1];
			currentBn._stormyKey = file.key;
			this.updateBN();
		}
		else {
			loadFile();
		}
	},
	saveFile: function() {
		if (stormy.available && currentBn._stormyKey) {
			stormy.saveFile(currentBn._stormyKey, currentBn.save_xdsl());
		}
		else {
			this.saveAsFile();
		}
	},
	saveAsFile: async function() {
		if (false && stormy.available) {
			var file = await stormy.saveFileDialog();
			stormy.saveFile(file.key, currentBn.save_xdsl());
		}
		else {
			$("a#download")
				.attr('href', 'data:text/plain;base64,'+window.btoa(currentBn.save_xdsl()))
				.attr('download', currentBn.fileName.replace(/\.\w*$/, '.xdsl'))
				[0].click();
		}
	},
	updateBN: function(callback) {
		updateBN(callback);
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
	clearEvidence: function() {
		currentBn.setEvidence({},{reset:true});
	},
	storeEvidence: function() {
		var evCopy = Object.assign({}, currentBn.evidence);
		currentBn.evidenceSets.push(evCopy);
		var evNum = 1;
		$('.evidenceMenu .evidenceItem').each(function() {
			var m = $(this).text().match(/#(\d+)$/);
			if (m) { evNum = Math.max(Number(m[1])+1,evNum); }
		});
		/*
		var ma = MenuAction('Restore Evidence #'+evNum, function() {
			currentBn.setEvidence(evCopy, {reset:true});
		}, {type: 'evidenceItem'});
		$('.evidenceMenu .itemList').append(ma.make().on("keypress", function(event) {
			if (event.key == 'Delete') {
				var i = $(this).text().match(/#(\d+)/)[1];
				delete currentBn.evidenceSets[i];
				$(this).remove();
			}
		}));
		*/
		$('.evidenceMenu .itemList').append(
			this.makeEvidenceMenuItem(evNum, evCopy)
		);
	},
	makeEvidenceMenuItem: function(evNum, evidence) {
		var ma = MenuAction('Restore Evidence #'+evNum, function() {
			currentBn.setEvidence(evidence, {reset:true});
		}, {type: 'evidenceItem'});
		
		return ma.make().on("keypress", function(event) {
			if (event.key == 'Delete') {
				var i = $(this).text().match(/#(\d+)/)[1];
				currentBn.evidenceSets[i-1] = null;
				$(this).remove();
			}
		});
	},
	makeEvidenceMenu: function(evidenceSets) {
		$('.evidenceMenu .evidenceItem').remove();
		for (var [evNum,evidence] of evidenceSets.entries()) {
			if (evidence === null)  continue;
			$('.evidenceMenu .itemList').append(
				this.makeEvidenceMenuItem(evNum+1, evidence)
			);
		}
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
	autoLayout: function(callback) {
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
				if (callback)  callback();
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
	learnParametersEm: function() {
		$('#openDataFile').on('change', function() {
			readChosenFile(this, function(fileData) {
				loadTabbedData(fileData);
				currentBn.learnParametersEm(openData[openData.length-1]).then(() => app.updateBN());
			});
		}).click();
	},
	learnStructureWithClass: function(method = {func: 'NaiveBayes', name: 'Naive Bayes'}) {
		$('#openDataFile').on('change', function() {
			readChosenFile(this, function(fileData) {
				loadTabbedData(fileData);
				data = openData[openData.length-1];
				var attrs = Object.keys(data[0]);
				var $dlg = popupDialog(`
					<h2>${method.name} Learner</h2>
					<div class=text>
					<p>Please choose the class node:
					<ul>
					${attrs.map(a=>`<li><a href="javascript:void(0)" data-node="${a}">${a}</a></li>`).join('')}
					</ul>
					</div>
				`, {buttons: [
					$('<button>').text('Cancel').on('click', dismissDialogs)
				]});
				$dlg.on('click', 'a', function(event) {
					dismissDialogs();
					var classNode = $(this).data("node");
					if (currentBn.nodes.length) {
						currentBn = new BN();
					}
					currentBn['learnStructure'+method.func](data, classNode);
					currentBn.display();
					app.updateBN(()=>app.autoLayout());
				});
			});
		}).click();
	},
	learnStructureNaiveBayes: function() {
		this.learnStructureWithClass({func:'NaiveBayes', name: 'Naive Bayes'});
	},
	learnStructureTan: function() {
		this.learnStructureWithClass({func:'Tan', name: 'TAN'});
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
	showShortcuts: function() {
		popupDialog(`<h2>Keyboard Shortcuts</h2><div class="shortcutList text">`
			+ Object.entries(keyboardShortcuts).map(k => `<div>
				<label class=shortcutLabel>`+toHtml(k[0])+`</label><span class=desc>`+toHtml(k[1].label)+`</span>
			</div>`).join('') + `</div>`, {className: 'keyboardShortcuts', buttons:[
				$('<button type=button>').text('OK').on('click', dismissDialogs),
			]});
	},
	about: function() {
		$.get('LICENSE', function(licenseString) {
			popupDialog(`<h2>Make-Believe</h2>
				<div>Release `+titlePostfix.replace(/^.*\(R?(.*)\)$/, '$1')+`</div>
				<div class=license>`+toHtml(licenseString).replace(/\n\n/g, '<p>')+`</div>`, {className: 'about', buttons:[
				$('<button type=button>').text('OK').on('click', dismissDialogs),
			]});
		}, 'text');
	},
};

$(document).ready(function() {
	var exampleBns = "Asia.xdsl|Bunce's Farm.xdsl|Cancer.dne|Continuous Test.xdsl|Logical Gates.xdsl|RS Latch.xdsl|Umbrella.xdsl|Water.xdsl".split(/\|/);
	var exampleBnActions = [];
	for (var i in exampleBns) {
		/// Need html escape function
		exampleBnActions[i] = MenuAction('<span data-name="'+exampleBns[i]+'">'+exampleBns[i]+'</span>', function() {
			window.location.href = "?file=bns/"+$(this).find('span').data("name");
		});
	}

	var menu = Menu({type: "bar", items: [
		Menu({label:"File", items: [
			MenuAction("New...", function(){ app.newFile(); dismissActiveMenus(); }, {shortcut: 'Ctrl-N'}),
			MenuAction("Open...", function(){ app.loadFile(); dismissActiveMenus(); }, {shortcut: 'Ctrl-O'}),
			MenuAction("Save...", function(){ app.saveFile(); dismissActiveMenus(); }, {shortcut: 'Ctrl-S', type: 'saveItem'}),
			Menu({label: "Example BNs", items: exampleBnActions}),
		]}),
		Menu({label:"Edit", items: [
			MenuAction("Undo", function() { currentBn.changes.undo(); }, {shortcut: 'Ctrl-Z'}),
			MenuAction("Redo", function() { currentBn.changes.redo(); }, {shortcut: 'Ctrl-Y'}),
			MenuAction("<hr>"),
			MenuAction("Select All", function() { currentBn.selectAll(); }, {shortcut: 'Ctrl-A'}),
		]}),
		Menu({label:"View", items: [
			MenuAction('<input type="range" name="viewZoom" min="0.25" max="3" step="0.25" value="1"> <span class="viewZoomText">100%</span>', function(){}),
			MenuAction("Auto-Layout", function() { app.autoLayout(); dismissActiveMenus(); }, {shortcut: 'Ctrl-Shift-A'}),
			Menu({label: "Nodes", items: [
				MenuAction('Labels Only', function() { app.changeNodeView('label'); dismissActiveMenus(); }),
				MenuAction('Detailed Nodes', function() { app.changeNodeView('distro'); dismissActiveMenus(); }),
				MenuAction('<hr>'),
				MenuAction('Header: ID', function() { app.changeNodeHeader('id'); dismissActiveMenus(); }),
				MenuAction('Header: Label', function() { app.changeNodeHeader('label'); dismissActiveMenus(); }),
				MenuAction('Header: Label + ID', function() { app.changeNodeHeader('idLabel'); dismissActiveMenus(); }),
			]}),
			MenuAction('<hr>'),
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
			MenuAction('Highlight D-Connected Nodes', function() {
				if ($(".dconnected").length) {
					$(".dconnected").removeClass("dconnected");
				}
				else {
					/// Find d-connected nodes for all selected nodes (I'm not sure
					/// this makes much sense)
					for (var node of currentBn.selected) {
						console.log('sel:', item);
						if (node instanceof Node) {
							var dConnectedNodes = currentBn.findAllDConnectedNodes2(node);
							for (var i=0; i<dConnectedNodes.length; i++) {
								var connectedNode = dConnectedNodes[i];
								$("#display_"+connectedNode.id).addClass("dconnected");
							}
						}
					}

				}
			}),
			MenuAction('Toggle BN Description', function() {
				currentBn.showComment(!$('.sidebar > .comment').is(':visible'), {force:true});
			}),
		]}),
		Menu({label:"Network", items: [
			MenuAction("Update", function() { app.updateBN(); dismissActiveMenus(); }),
			MenuAction("Find Good Decisions", function() { app.findGoodDecisions(); dismissActiveMenus(); }),
			MenuAction('Clear Evidence', function() { app.clearEvidence(); dismissActiveMenus(); } ),
			MenuAction('Calculate Probability of Evidence', function() { app.showProbabilityOfEvidence(); dismissActiveMenus(); } ),
			Menu({label:'Evidence', type:'evidenceMenu', items: [
				MenuAction('Store Current', function() { app.storeEvidence(); }),
			]}),
			MenuAction('Time Limit: <input type="text" name="timeLimit" value="0">ms', function() { }),
			MenuAction('# Samples: <input type="text" name="iterations" value="1000">', function() { }),
			Menu({label:"Learn", items: [
				MenuAction('Parameters: Counting...', function() { app.learnParametersCounting(); dismissActiveMenus(); } ),
				MenuAction('Parameters: EM...', function() { app.learnParametersEm(); dismissActiveMenus(); } ),
				MenuAction('Structure: Naive Bayes...', function() { app.learnStructureNaiveBayes(); dismissActiveMenus(); } ),
				MenuAction('Structure: TAN...', function() { app.learnStructureTan(); dismissActiveMenus(); } ),
			]}),
			MenuAction('Flatten Network', function() { app.flattenNetwork(); dismissActiveMenus(); } ),
		]}),
		Menu({label:"(Debug)", items: [
			MenuAction('# Workers: <input type="text" name="numWorkers" value="2">', function() { }),
			MenuAction('# Perf Loops: <input type="text" name="perfLoops" value="100">', function() { }),
			MenuAction('# Perf Samples: <input type="text" name="perfIterations" value="10000">', function() { }),
			MenuAction('Perf Check Local', function() { currentBn.perfCheck(); }),
			MenuAction('Perf Check Worker', function() { currentBn.perfCheckWorker(); }),
			MenuAction("Load Data...", function(){ $('#openDataFile').change(function() {
				readChosenFile(this, loadTabbedData);
			}).click(); dismissActiveMenus(); }),
			Menu({label:"Tests", items: [
				MenuAction('Run Tests', function() { alert('Check JavaScript console for results'); testing.runTests(); }),
			]}),
		]}),
		Menu({label:"Help", items: [
			MenuAction('Keyboard Shortcuts', function() { app.showShortcuts(); }),
			MenuAction('About Make-Believe', function() { app.about(); }),
		]}),
	]});

	$("body").prepend(menu.make());
	
	stormy.on('startup', function(available) {
		if (available) {
			var ma = MenuAction("Save As...", function(){ app.saveAsFile(); dismissActiveMenus(); }, {shortcut: 'Ctrl-Alt-S'});
			$('.bar.menu .saveItem')
				.after(ma.make())
				.find('.label').text('Save');
		}
	});

	/// Setup initial keyboard shortcuts (these can be overriden after the fact)
	$.extend(keyboardShortcuts, menu.collectShortcuts());
	$(document).on('keypress', function(event) {
		if (!$(event.target).is('textarea, input, select')) {
			/// Make hash from event
			var keyHash = (event.ctrlKey?'Ctrl-':'')
				+ (event.altKey?'Alt-':'')
				+ (event.shiftKey?'Shift-':'')
				+ (event.metaKey?'Meta-':'')
				+ event.key[0].toUpperCase()+event.key.slice(1);
			console.log(keyHash);
			if (keyboardShortcuts[keyHash]) {
				keyboardShortcuts[keyHash].action();
				event.preventDefault();
				return false;
			}
		}
	});

	/** Evidence **/
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
				var e = currentBn.evidence[nodeId+(t==0?"":"_"+t)];
				if (e !== undefined)  $(this).find("select").val( e );
				t++;
			});
			$(".dialog .okButton").one("click", function() {
				var t = 0;
				$(".dialog").find(".timestep").each(function() {
					var timeStepVal = $(this).find("select").val();
					console.log(timeStepVal, $(this).find("select").text());

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
	
	/** Item movement **/
	var mx = 0, my = 0;
	var disableSelect = 0;
	/// For aligning things when moving them
	var snapOn = true;
	var snapGridSize = 5;
	$(".bnview").on("mousedown", ".node h6, .submodel:not(.parent), .textBox", function(event) {
		if (event.which > 1)  return;
		//event.preventDefault();
		mx = event.originalEvent.pageX;
		my = event.originalEvent.pageY;
		//onsole.log("mousedown:", mx, my);
		var $node = $(this).closest(".node, .submodel, .textBox");
		var o = $node.offset();
		disableSelect = 2;
		var selectedOffsets = new Map();
		var selectedNodes = [];
		for (var node of currentBn.selected) {
			if (node instanceof Node) {
				selectedNodes.push(node);
				selectedOffsets.set(node, $(`#display_${node.id}`).offset());
			}
		}

		/// Get the width/height if the mousedown node was not part of the network
		var maxX = 0, maxY = 0;
		var graphItems = currentBn.getGraphItems();
		var hAlignItems = [];
		var vAlignItems = [];
		for (var i=0; i<graphItems.length; i++) {
			var graphItem = graphItems[i];
			if (graphItem.isHidden && graphItem.isHidden())  continue;
			if (("display_"+graphItem.id)==$node.attr("id"))  continue;
			if (currentBn.selected.has(graphItem))  continue;
			var $graphItem = $("#display_"+graphItem.id);
			var n = draw.getBox($graphItem);
			maxX = Math.max(maxX, n.x+n.width);
			maxY = Math.max(maxY, n.y+n.height);
			if (snapOn) {
				var $op = $graphItem.offsetParent();
				hAlignItems.push([n.y+$op.offset().top,n,graphItem,"top"]);
				hAlignItems.push([n.y+$op.offset().top+n.height,n,graphItem,"bottom"]);
				vAlignItems.push([n.x+$op.offset().left,n,graphItem,"left"]);
				vAlignItems.push([n.x+$op.offset().left+n.width,n,graphItem,"right"]);
			}
		}

		var newLeft = null;
		var newTop = null;
		$(".bnouterview").on("mousemove", function(event) {
			$(".hAlignLine").hide();
			$(".vAlignLine").hide();
			$(".aligning").removeClass("aligning");
			var nmx = event.originalEvent.pageX;
			var nmy = event.originalEvent.pageY;
			//onsole.log("mousemove:", nmx, nmy, {left: o.left + (nmx - mx), top: o.top + (nmy - my)});
			/// Move the DOM object, but not the net object yet
			newLeft = o.left + (nmx - mx);
			newTop = o.top + (nmy - my);
			if (snapOn) {
				/// Find something to align with if possible
				for (var i=0; i<hAlignItems.length; i++) {
					var otherItem = hAlignItems[i];
					if (Math.floor(otherItem[0]/snapGridSize)==Math.floor(newTop/snapGridSize)) {
						newTop = otherItem[0];
						$("#display_"+otherItem[2].id).addClass("aligning");
						if (!$(".hAlignLine").length)  $("<div class=hAlignLine>").appendTo(".bnview");
						$(".hAlignLine").show().offset({top: newTop});
						break;
					}
					else if (Math.floor(otherItem[0]/snapGridSize)==Math.floor((newTop+$node.outerHeight())/snapGridSize)) {
						newTop = otherItem[0]-$node.outerHeight();
						$("#display_"+otherItem[2].id).addClass("aligning");
						if (!$(".hAlignLine").length)  $("<div class=hAlignLine>").appendTo(".bnview");
						$(".hAlignLine").show().offset({top: newTop+$node.outerHeight()});
						break;
					}
				}
				/// Find something to align with if possible
				for (var i=0; i<vAlignItems.length; i++) {
					var otherItem = vAlignItems[i];
					if (Math.floor(otherItem[0]/snapGridSize)==Math.floor(newLeft/snapGridSize)) {
						newLeft = otherItem[0];
						$("#display_"+otherItem[2].id).addClass("aligning");
						if (!$(".vAlignLine").length)  $("<div class=vAlignLine>").appendTo(".bnview");
						$(".vAlignLine").show().offset({left: newLeft});
						break;
					}
					else if (Math.floor(otherItem[0]/snapGridSize)==Math.floor((newLeft+$node.outerWidth())/snapGridSize)) {
						newLeft = otherItem[0]-$node.outerWidth();
						$("#display_"+otherItem[2].id).addClass("aligning");
						if (!$(".vAlignLine").length)  $("<div class=vAlignLine>").appendTo(".bnview");
						$(".vAlignLine").show().offset({left: newLeft+$node.outerWidth()});
						break;
					}
				}
			}
			$node.offset({left: newLeft, top: newTop});
			var curMaxX = maxX, curMaxY = maxY;
			for (var selNode of currentBn.selected) {
				if (selNode instanceof Node) {
					var $selNode = $(`#display_${selNode.id}`);
					if (!$selNode.is($node)) {
						var sno = selectedOffsets.get(selNode);
						$selNode.offset({left: sno.left + (newLeft - o.left), top: sno.top + (newTop - o.top)});
					}
				}
			}
			var {maxX: curMaxX, maxY: curMaxY} = currentBn.redrawArcs(selectedNodes, curMaxX, curMaxY);
			//for (var key in
			var n = currentBn.getGraphItemById($node.attr("id").replace(/^display_/,""));
			if (n.pathsIn)  currentBn.redrawArcs(n, curMaxX, curMaxY);
			disableSelect = 3;
		});
		$(".bnouterview").on("mouseup", function(event) {
			$(".hAlignLine").hide();
			$(".vAlignLine").hide();
			$(".aligning").removeClass("aligning");
			/// Update position of the node
			if (newLeft !== null) {
				var nmx = event.originalEvent.pageX;
				var nmy = event.originalEvent.pageY;
				//onsole.log("mouseup:", nmx, nmy, {left: o.left + (nmx - mx), top: o.top + (nmy - my)});
				$node.offset({left: newLeft, top: newTop});

				/// Now it's final, update the net object
				var n = currentBn.getGraphItemById($node.attr("id").replace(/^display_/,""));
				var dLeft = (newLeft - o.left);
				var dTop = (newTop - o.top);
				
				
				var els = document.elementsFromPoint(event.clientX, event.clientY);
				var submodel = els.find(el => el.matches('.submodel'));
				submodel = $(submodel).data('submodel');
				if (submodel) {
					var n = submodel.net.getGraphItemById($node.attr("id").replace(/^display_/,""));
					n.moveToSubmodel( submodel );
					for (var node of currentBn.selected) {
						//onsole.log(node.id, submodel.id);
						node.moveToSubmodel( submodel );
						selectedOffsets[node]
					}
					submodel.net.display();
					submodel.net.displayBeliefs();
				}
				else {
					n.pos.x += dLeft;
					n.pos.y += dTop;
					for (var node of currentBn.selected) {
						if (node.id != n.id) {
							//onsole.log(node.id, submodel.id);
							node.pos.x += dLeft;
							node.pos.y += dTop;
						}
					}

					/// Update the arcs going into/out of this node
					// Following not needed
					//if (n.pathsIn)  currentBn.redrawArcs(n, maxX, maxY);
				}

			}
			$(".bnouterview").unbind("mousemove").unbind("mouseup");
			

			disableSelect -= 1;
		});
	});

	/** Select multiple objects (currently only includes nodes) **/
	$(".bnview").on('mousedown', function(event) {
		if (!$(event.target).closest('.item').length) {
			if (!event.ctrlKey && !event.altKey)  currentBn.clearSelection();
			var turnOn = !event.altKey ? true : false;
			var view = $('.bnview').offset();
			var {pageX: origX, pageY: origY} = event;
			var $rectSelect = $('<div class=rectSelect>')
				.css({top: origY - view.top, left: origX - view.left, display: 'none'})
				.appendTo('.bnview');
			event.preventDefault();
			$('.bnview').on('mousemove.rectSelect', function(event) {
				var {pageX: curX, pageY: curY} = event;
				$rectSelect.css({
					top: (curY < origY ? curY : origY) - view.top, left: (curX < origX ? curX : origX) - view.left,
					width: Math.abs(curX - origX), height: Math.abs(curY - origY), display: 'block'});
			}).on('mouseup.rectSelect', function(event) {
				/// Which items are contained in the rectangle?
				var rect = $.extend($rectSelect.offset(), {width: $rectSelect.width(), height: $rectSelect.height()});
				$('.bnview .node').each(function() {
					var node = $.extend($(this).offset(), {width: $(this).width(), height: $(this).height()});
					//onsole.log(node, rect);
					if (rect.top <= node.top && node.top+node.height <= rect.top+rect.height
							&&
							rect.left <= node.left && node.left+node.width <= rect.left+rect.width) {
						console.log('hit');
						currentBn.findItem(this).guiToggleSelect({on:turnOn});
					}
				});
				$('.bnview').off('.rectSelect');
				$rectSelect.remove();
			});
		}
	});

	/** Arc drawing. Yay! **/
	var startNode = null;
	var DCTIMEOUT = 200; //ms
	var timerId = null;
	var singleClick = true;
	$(".bnview").on("mousedown", ".node .hotSpot", function(event) {
		if ($(event.target).closest('h6').length)  return;
		console.log('mousedown');
		if (singleClick || timerId !== null) {
			if (!singleClick) {
				/// We have a double-click, so clear the clock
				clearTimeout(timerId); timerId = null;
				event.preventDefault();
			}

			var $node = $(event.target).closest('.node');
			startNode = currentBn.find($node);

			var ncs = $(".netSvgCanvas").offset();
			var sourcePoint = {x: event.pageX - ncs.left, y: event.pageY - ncs.top};
			var destPoint = {x: sourcePoint.x, y: sourcePoint.y};
			var sourceBox = draw.getBox($node);
			var destBox = {x: sourceBox.x, y: sourceBox.y, width: 1, height: 1, borderRadius: 0};
			var par = sourceBox;
			var child = destBox;
			var $arc = null;
			var arcDirection = 0; /// 0 means left/down, 1 means right/up
			var origCanvas = {width: $(".netSvgCanvas").width(), height:$(".netSvgCanvas").height()};

			var exitSide = null;
			function tempMouseMove(event) {
				destPoint.x = event.pageX - ncs.left;
				destPoint.y = event.pageY - ncs.top;
				if (!exitSide) {
					/// If first time out of box. Which side did we exit?
					var exitSideCheck = destPoint.x < sourceBox.x ? "left" :
						destPoint.x > sourceBox.x + sourceBox.width ? "right" :
						destPoint.y < sourceBox.y ? "top" :
						destPoint.y > sourceBox.y + sourceBox.height ? "bottom" :
						null;
					console.log(exitSideCheck);
					if (!exitSideCheck) {
						return;
					}
					exitSide = exitSideCheck;
					/// Depending on how we start pulling out the arrow, make
					/// it a child (right or bottom) or parent (left or up)
					if (exitSide == "left" || exitSide == "top") {
						par = destBox;
						child = sourceBox;
						arcDirection = 1;
					}
				}
				/// Draw arrow to this point
				destBox.x = event.pageX - $(".netSvgCanvas").offset().left;
				destBox.y = event.pageY - $(".netSvgCanvas").offset().top;
				/// FIX: Obviously don't want to draw a new arrow all the time!
				if (!$arc) {
					$arc = draw.drawArrowBetweenBoxes($('.netSvgCanvas'), par, child);
					//onsole.log($arc.attr('d'), par, child);
				}
				else {
					draw.drawArrowBetweenBoxes($arc, par, child);
					//onsole.log($arc.attr('d'), par, child);
				}
				/// Update max x/y as extents for canvas if necessary
				var b = draw.getBox($arc);
				//onsole.log("ARC BOX:", b, $arc);
				var maxX = Math.max(origCanvas.width, b.x+b.width);
				var maxY = Math.max(origCanvas.height, b.y+b.height);
				//onsole.log(maxX, maxY);
				if (maxX != origCanvas.width || maxY != origCanvas.height) {
					$(".netSvgCanvas").attr("width", maxX).attr("height", maxY);
				}
			}

			$(window).on("mousemove", tempMouseMove);

			/// We bind to window, so that *any* mouseup event (even outside of window)
			/// clears the startNode
			$(window).one("mouseup", function(event) {
				if (!singleClick)  event.preventDefault();
				$(window).unbind("mousemove", tempMouseMove);
				/// The mouseup event needs to be from the left-click,
				/// not a right-click (or middle-click), which would cancel the drag
				if (startNode && event.which == 1) {
					var $node = $(event.target).closest('.node');
					if ($node.length) {
						endNode = currentBn.find($node);
						/// Check that the arc is valid
						//if (no cycles) {
							if (arcDirection==1) {
								startNode.addParents([endNode]);
							}
							else {
								endNode.addParents([startNode]);
							}
							currentBn.display();
							currentBn.updateAndDisplayBeliefs();
						//}
					}
					/// Make a new node especially
					else {
						var i = 0;
						while (currentBn.nodesById["node"+i]) i++;
						if (!$(event.target).closest('.graphItem').length) {
							var nsc = $('.netSvgCanvas').offset();
							newNode = currentBn.addNode("node"+i, ["state0","state1"], {cpt:[.5,.5], pos: {x: event.pageX - nsc.left, y: event.pageY - nsc.top}});
							console.log(newNode.statesById);
							if (arcDirection==1) {
								startNode.addParents([newNode]);
							}
							else {
								newNode.addParents([startNode]);
							}
							currentBn.display();
							currentBn.updateAndDisplayBeliefs(null, () => $('#display_'+newNode.id+' h6').map(lightNodeEdit));
						}
						//event.preventDefault();
						//return false;
					}
				}
				startNode = null;
			}).one("click", function(event) {
				if (event.which != 1) {
					if (!singleClick)  event.preventDefault();
				}
			});
		}
		else {
			/// Start the clock for the next click
			timerId = setTimeout(function() {
				/// If no second click, clear the clock
				timerId = null;
			}, DCTIMEOUT);
		}
	}).on('mouseup', '.node', function() {
		console.log('mouseup');
	});

	/// Having slightly weird problem in Firefox (maybe others too --- maybe jquery?), where 'click' is being
	/// triggered, even though mouseup occurs in different place. If this is temporary, revert
	/// to the 'click' version.
	$(".bnview").on("mousedown", function(event) {
		$('.bnview').one('mouseup', function(event2) {
			if (event.pageX == event2.pageX && event.pageY == event2.pageY) {
				currentBn.clearSelection();
				if (!$(event.target).closest(document.activeElement).length) {
					document.activeElement.blur();
				}
			}
		});
	});
	/* Reenable (and update) following once working properly:

	$(".bnview").on("click", function(event) {
		for (var nodeId in currentBn.selected) {
			currentBn.nodesById[nodeId].guiToggleSelect();
		}
	});
	*/

	/// This prevents the 'clearSelection' from triggering, when we don't want it
	/// (If I revert to just 'click', rather than mousedown/up for clearSelection,
	/// I need to change, obviously.)
	$('.bnview').on('mousedown', '.node h6, .dependencyClickArea', function(event) {
		event.stopPropagation();
	});

	/** Select nodes **/
	$(".bnview").on("click", ".node h6", function(event) {
		//console.log("dis:",disableSelect);
		disableSelect -= 1;
		if (disableSelect) { disableSelect -= 1; return; }
		var nodeId = $(this).closest(".node")[0].id.replace(/^display_/, '');

		currentBn.nodesById[nodeId].guiToggleSelect();
	});
	
	/** Select arcs **/
	$('.bnview').on('click', '.dependencyClickArea', function(event) {
		if (event.which == 1) {
			/// Need to be a bit more forgiving in terms of click area for arcs
			var $p = $(this).data('path');
			if (!$(this).is('.selected')) {
				$(this).addClass('selected');
				$p.addClass('selected');
				currentBn.selected.add($p.data('arcSelector'));
			}
			else {
				$(this).removeClass('selected');
				$p.removeClass('selected');
				currentBn.selected.remove($p.data('arcSelector'));
			}
		}
	});
	
	$(document).on('keypress', function(event) {
		var $t = $(event.target);
		if (!$t.closest('.node, .submodel, .text, input, select, textarea, [contenteditable]').length) {
			if (event.key == "Delete") {
				for (var item of currentBn.selected) {
					item.delete();
					currentBn.selected.delete(item);
				}
				currentBn.display();
				currentBn.updateAndDisplayBeliefs();
			}
		}
	});

	/// This will setup the node for light editing (directly
	/// on the canvas, rather than in a properties box)
	/// XXX: This activeEditEndFunction is a really crap way of handling
	/// just one active node edit at the same time! Fix.
	var activeEditEndFunction = null;
	window.lne = lightNodeEdit;
	function lightNodeEdit() {
		if (activeEditEndFunction) {
			activeEditEndFunction();
		}
		var node = currentBn.findItem(this);
		var $node = $(this).closest('.node');
		/// The 'fields' are the pieces of the node that can be edited
		var fieldSel = 'h6, .stateName';
		var $fields = $node.find(fieldSel);
		var $currentField = null;

		function startEdit(initialField) {
			$node.addClass('editMode');
			$fields.attr('contenteditable', 'true');
			$currentField = $(initialField);
			$currentField.focus();
			document.execCommand('selectAll', false, null);

			$(document).on('click.nodeEdit', function(event) {
				var $t = $(event.target);
				/// If clicking inside node, don't clear
				if ($t.closest($node).length) {
					return;
				}

				/// If clicking outside node, save and end edit session
				endEdit();
				if ($currentField)  updateField($currentField);
			}).on('keypress.nodeEdit', function(event) {
				var $source = $(event.target).closest('h6, .stateName');
				if (event.key == 'Escape') {
					endEdit();
					if ($source.length)  updateField($source);
				}
				else if (event.key == 'Enter') {
					event.preventDefault();
					var handled = false;
					if ($source.is('.stateName')) {
						if (event.ctrlKey) {
							handled = true;
							//event.stopPropagation();
							addState($source, event.shiftKey);
						}
					}
					if (!handled)  endEdit();
					if ($source.length)  updateField($source);
				}
				else if (event.key == 'ArrowUp'
						|| event.key == 'ArrowDown') {
					var dir = event.key=='ArrowUp' ? -1 : 1;
					var prevNext = dir == 1 ? 'next' : 'prev';
					var beforeAfter = dir == 1 ? 'after' : 'before';
					console.log(dir, prevNext, beforeAfter);
					var $state = $source.closest('.state');
					/// If ctrl pressed, then move the actual state (rather than
					/// just shift focus)
					if (event.ctrlKey && $state.length) {
						var $otherState = $state[prevNext]();
						$otherState[beforeAfter]($state);
						$currentField = $state.find('.stateName');
						$currentField.focus();
						var fromI = $state.find('.stateName').attr('data-index');
						var toI = $otherState.find('.stateName').attr('data-index');
						node.moveStates( {[fromI]: toI} );
						$state.find('.stateName').attr('data-index', toI);
						$otherState.find('.stateName').attr('data-index', fromI);
					}
					else {
						$currentField = $source.closest('.state, .controlBar')[prevNext]()
							.find('.stateName, h6');
						$currentField.focus();
						//onsole.log($source);
					}
					document.execCommand('selectAll', null, false);
					event.preventDefault();
				}
				else if (event.key == 'Delete' && event.ctrlKey) {
					if ($source.is('.stateName')) {
						deleteState($source);
					}
				}
			}).on('focus.nodeEdit', 'h6, .stateName', function() {
				console.log('ff');
				$currentField = $(this);
				document.execCommand('selectAll', false, null);
			}).on('blur.nodeEdit', 'h6, .stateName', function() {
				updateField(this);
				$currentField = null;
			});
			$node.on('click.nodeEdit', 'h6, .stateName', function(event) {
				event.stopImmediatePropagation();
			});
		}

		function fixStates() {
			var $displayNode = $('#display_'+node.id);
			/// Renumber states (simple)
			var newStatesI = 0;
			$displayNode.find('.state').each(function() {
				var $stateName = $(this).find('.stateName');
				$stateName.attr("data-index", newStatesI++);
			});
			node.net.updateAndDisplayBeliefs();
		}
		
		function addState(el, before) {
			var $el = $(el);
			var stateI = Number($el.attr('data-index'));
			var newStateI = before ? stateI : stateI+1;
			var $displayNode = $('#display_'+node.id);
			/// Make sure stateName is unique
			var extraI = node.states.length;
			var stateName = "state"+extraI;
			while (node.statesById[stateName])  stateName = "state"+(++extraI);
			node.net.changes.addAndDo({
				node: node,
				refStateI: stateI,
				newStateI: newStateI,
				newStateName: stateName,
				redo() {
					var $state = $displayNode.find(`.stateName[data-index=${this.refStateI}]`).closest('.state');
					var $newState = $state.clone(true);
					$newState.find('.stateName')
						.attr('data-index', this.newStateI).data('index', this.newStateI).text(this.newStateName);
					var newStateI = this.newStateI;
					if (before)  $state.before($newState);
					else  $state.after($newState);
					//$state.after($newState);
					node.addStates([this.newStateName], {at: this.newStateI});
					fixStates();
				},
				undo() {
					node.removeStates([this.newStateI]);
					var $state = $displayNode.find(`.stateName[data-index=${this.newStateI}]`).closest('.state');
					$state.remove();
					fixStates();
				},
			});
			
			var $newState = $displayNode.find(`.stateName[data-index=${newStateI}]`).closest('.state');
			var newEl = $newState.find('.stateName').focus();
			document.execCommand('selectAll', false, null);
		}

		function updateField(el) {
			var $el = $(el);
			if ($el.is('h6') && node.id != $el.text()) {
				node.net.changes.addAndDo({
					node: node,
					oldId: node.id,
					oldLabel: node.label,
					newId: makeValidId($el.text()),
					newLabel: $el.text(),
					rename(oldId, toId, toLabel) {
						var $displayNode = $('#display_'+oldId);
						$displayNode.attr("id", 'display_'+toId);
						node.label = toLabel;
						node.rename(toId);
						$displayNode.find('h6').html(currentBn.headerFormat(node.id,node.label));
					},
					undo() { this.rename(this.newId, this.oldId, this.oldLabel); },
					redo() { this.rename(this.oldId, this.newId, this.newLabel); }
				});
			}
			else if ($el.is('.stateName')) {
				var stateI = $el.attr('data-index');
				var oldStateId = node.states[$el.attr('data-index')].id;
				var $displayNode = $('#display_'+node.id);
				var $stateId = $displayNode.find(`.stateName[data-index=${stateI}]`);
				var newStateId = $stateId.text();
				//onsole.trace();
				//onsole.log('doing rename', el, $el.data('index'), $el.attr('data-index'), stateI, oldStateId, newStateId, $stateId, $displayNode);
				if (oldStateId != newStateId) {
					node.net.changes.addAndDo({
						node: node,
						stateI: stateI,
						oldStateId: oldStateId,
						newStateId: newStateId,
						renameState(toStateId) {
							node.renameStates( {[this.stateI]: toStateId} );
							$stateId.text(toStateId);
						},
						undo() { this.renameState(this.oldStateId); },
						redo() { this.renameState(this.newStateId); },
					});
				}
			}
		}
		
		function deleteState(el) {
			var $el = $(el);
			var $state = $el.closest('.state');
			var $displayNode = $('#display_'+node.id);
			
			var stateI = Number($el.attr('data-index'));
			var removedState = node.states[stateI];
			
			node.net.changes.addAndDo({
				removedState: removedState,
				$state: $state,
				redo() {
					node.removeStates([this.removedState.index]);
					$state.remove();
					fixStates();
				},
				undo() {
					/*this.$state.find('.stateName')
						.attr('data-index', this.removedState.index)
						.data('index', this.removedState.index)
						.text(this.removedState.id);*/
					$refState = $displayNode.find(`.stateName[data-index=${this.removedState.index}]`).closest('.state');
					$refState.before(this.$state);
					node.addStates([removedState.id], {at: this.removedState.index});
					fixStates();
				},
			});
		}

		function endEdit() {
			$node.removeClass('editMode');
			$node.find(fieldSel).attr('contenteditable', null);
			$(document).off('.nodeEdit');
			$node.off('.nodeEdit');
			document.activeElement.blur();
			window.getSelection().removeAllRanges();
			activeEditEndFunction = null;
		}
		activeEditEndFunction = endEdit;

		startEdit(this);

		return false;
	}
	$(".bnview").on("dblclick", ".node h6, .node .stateName", lightNodeEdit);

	/** This needs to change **/
	$(".bnview").on("dblclick", ".textBox", function(event) {
		$(this).attr("contenteditable", "");
		$(this).focus();
		document.execCommand('selectAll', false, null);
		event.preventDefault();
		event.stopPropagation();
	}).on("blur", ".textBox", function() {
		$(this).removeAttr("contenteditable");
		window.getSelection().removeAllRanges();
		var $textBox = $(this);
		var textBox = currentBn.getItem(this);
		var newText = $textBox.html().replace(/<br>/g, '\n');
		currentBn.changes.addAndDo({
			newText: newText,
			oldText: textBox.text,
			exec(text) {
				textBox.setText(text);
				$textBox.html(text.replace(/\n/g, '<br>'));
			},
			redo() { this.exec(this.newText); },
			undo() { this.exec(this.oldText); },
		});
	});

	/// Submodel navigation
	$(".bnview").on("dblclick", ".submodel", function() {
		currentBn.currentSubmodel = $(this).data("submodel").submodelPath.concat($(this).data("submodel").id ? [$(this).data("submodel").id] : []);
		currentBn.display();
		currentBn.displayBeliefs();
	});

	$(".bnview").on("dblclick", function(event) {
		/*
		var i = 0;
		while (currentBn.nodesById["node"+i]) i++;
		if ($(event.target).is(".bnview") || $(event.target).is(".netSvgCanvas")) {
			var node = currentBn.addNode("node"+i, ["state0","state1"], {cpt:[.5,.5], pos: {x: event.offsetX, y: event.offsetY}, addToCanvas: true});
			$('#display_'+node.id+' h6').map(lightNodeEdit);
		}
		event.preventDefault();
		return false;*/
		var target = event.target;
		var offsetX = event.offsetX;
		var offsetY = event.offsetY;
		var menu = Menu({
			type: 'contextMenu',
			label: 'Make',
			items: [
				MenuAction('Node', () => {
					if ($(target).is(".bnview") || $(target).is(".netSvgCanvas")) {
						var node = currentBn.addNode(null, null, {cpt:[.5,.5], pos: {x: offsetX, y: offsetY}, addToCanvas: true});
						$('#display_'+node.id+' h6').map(lightNodeEdit);
					}
					menu.dismiss();
					return false;
				}),
				MenuAction('Submodel', () => {
					currentBn.addSubmodel(null, {pos: {x: offsetX, y: offsetY}, addToCanvas: true});
					menu.dismiss();
					return false;
				}),
				MenuAction('Text Box', () => {
					var textBox = currentBn.addTextBox('[Insert text]', {pos: {x: offsetX, y: offsetY}, addToCanvas: true});
					$('#display_'+textBox.id).trigger('dblclick');
					menu.dismiss();
					return false;
				}),
			],
		});
		menu.popup({left: event.clientX, top: event.clientY - 15});
		event.preventDefault();
		return false;
	});

	$(document).on("contextmenu", ".node, .submodel", function(event) {
		if (event.shiftKey)  return false;
		var $displayItem = $(this);
		var item = currentBn.getItemById($displayItem.attr("id").replace(/^display_/, ''));
		item.contextMenu(event);
		return false;
	});
	
	$(document).on("contextmenu", ".dependencyClickArea", function(event) {
		if (event.shiftKey)  return false;
		$(this).data('path').data('arcSelector').contextMenu(event);
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
	$("[name=timeLimit]").on("keyup", function(evt) {
		var timeLimit = parseInt($(evt.target).val());
		currentBn.timeLimit = timeLimit;
		if (timeLimit) {
			$("[name=iterations]")[0].disabled = true;
		}
		else {
			$("[name=iterations]")[0].disabled = false;
		}
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

	/// Allow dropping of BN files to open them
	$("body").on("drop", function(event) {
		event.preventDefault();
		var dt = event.originalEvent.dataTransfer;
		if (dt.files) {
			fileLoaded(dt.files[0], updateBN);
		}
	}).on("dragover", function(event) {
		event.preventDefault();
		// Set the dropEffect to move
		event.originalEvent.dataTransfer.dropEffect = "open";
	});
	
	$(document).on('keypress', (event) => {
		if (event.key == 'Escape') {
			$('.console').toggle();
			$('.consoleInput').focus();
		}
	});
	
	consoleHistory = [];
	consoleHistory.pos = 0;
	$('.consoleInput').on('keypress', (event) => {
		console.log(event.key);
		if (event.key == 'Enter') {
			var txt = $('.consoleInput').val();
			console.log(txt);
			
			if (txt != consoleHistory[consoleHistory.length-1]) {
				consoleHistory.push(txt);
				consoleHistory.pos++;
			}
			$('.consoleInput').val('');
			$('.consoleInput').blur();
			
			var m = txt.match(/^(.*)(<-|->)(.*)$/);
			console.log(m);
			if (m) {
				var parents = m[1].trim().split(/\s*,\s*/);
				var children = m[3].trim().split(/\s*,\s*/);
				console.log(parents, children);
				for (var parent of parents) {
					for (var child of children) {
						if (!currentBn.nodesById[parent])  currentBn.addNode(parent);
						if (!currentBn.nodesById[child])  currentBn.addNode(child);
						var parentNode = currentBn.nodesById[parent];
						var childNode = currentBn.nodesById[child];
						parentNode.addChildren([childNode]);
					}
				}
				currentBn.display();
				app.autoLayout(() => {
					$('.consoleInput').focus();
				});
			}
		}
		else if (event.key == 'ArrowUp') {
			if (consoleHistory.pos > 0) {
				consoleHistory.pos--;
				$('.consoleInput').val(consoleHistory[consoleHistory.pos]);
			}
		}
		else if (event.key == 'ArrowDown') {
			if (consoleHistory.pos < consoleHistory.length) {
				consoleHistory.pos++;
				if (consoleHistory.pos < consoleHistory.length) {
					$('.consoleInput').val(consoleHistory[consoleHistory.pos]);
				}
				else {
					$('.consoleInput').val('');
				}
			}
		}
	});

	if (window.qs.file) {
		loadFromServer(window.qs.file, updateBN);
	}
	else {
		currentBn = new BN({filename: `bn${++guiBnCount}.xdsl`});
		currentBn.display();
	}
});

