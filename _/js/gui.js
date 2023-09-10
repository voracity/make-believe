var keyboardShortcuts = {};
var guiBnCount = 0;
var openBns = [];
var openData = [];
var currentBn = null;
var CANVASPAD = 10;

var draw = {
	arrowHeadGap: 8,
	arrowHeadWidth: 10,
	arrowHeadHeight: 10,
	/// Create the SVG canvas for all arrows
	createSvg: function(outputEl, x, y, width, height, cls) {
		let aw = this.arrowHeadWidth;
		let ah = this.arrowHeadHeight;
		return $(`<svg width="${width}" height="${height}"><defs>
				<marker id='arrowhead' viewBox='0 0 ${aw} ${ah}' refX='1' refY='${ah/2}'
				markerUnits='userSpaceOnUse' orient='auto'
				markerWidth='${aw}' markerHeight='${ah-1}'>
				<polyline points='0,0 ${aw},${ah/2} 0,${ah} 1,${ah/2}' fill=black/>
				</marker>
				</defs></svg>`)
			.attr("class", cls)
			.css({left: x, top: y, position: "absolute"})
			.appendTo(outputEl);
	},
	getDistance(point1, point2) {
		let d = 0;
		for (let i=0; i<point1.length; i++) {
			d += Math.pow(point1[i] - point2[i], 2);
		}
		return Math.sqrt(d);
	},
	getClosestPointOnSegment(point, segment) {
		/// As per https://math.stackexchange.com/a/3128850
		let _zero2D = [0, 0];
		let _tToPoint = (t, P, A, B) => [
			(1 - t) * A[0] + t * B[0] - P[0],
			(1 - t) * A[1] + t * B[1] - P[1],
		];
		let _sqDiag2D = P => P[0] ** 2 + P[1] ** 2;
		
		let P = point, A = segment[0], B = segment[1];
		
		let v = [B[0] - A[0], B[1] - A[1]];
		let u = [A[0] - P[0], A[1] - P[1]];
		let vu = v[0] * u[0] + v[1] * u[1];
		let vv = v[0] ** 2 + v[1] ** 2;
		let t = -vu / vv;
		if (t >= 0 && t <= 1) return _tToPoint(t, _zero2D, A, B);
		let g0 = _sqDiag2D(_tToPoint(0, P, A, B));
		let g1 = _sqDiag2D(_tToPoint(1, P, A, B));
		return g0 <= g1 ? A : B;
	},
	/// points is same format as from <path>.getPathData()
	getClosestSegmentPoint(points, point) {
		let [x,y] = point;
		let overallClosestDist = Infinity;
		let overallClosestPoint = null;
		let overallClosestI = 0;
		for (let i=0; i<points.length-1; i++) {
			let p1 = points[i], p2 = points[i+1];
			let closestPoint = draw.getClosestPointOnSegment([x,y], [p1.values, p2.values]);
			let thisPointDist = draw.getDistance(closestPoint, [x,y]);
			if (thisPointDist < overallClosestDist) {
				overallClosestDist = thisPointDist;
				overallClosestPoint = closestPoint;
				overallClosestI = i;
			}
		}
		
		return {i: overallClosestI, point: overallClosestPoint, dist: overallClosestDist};
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
			/// More reliable than (currently possessed) jQuery for width/height
			box = el.getBoundingClientRect();
			let scale = el.offsetWidth ? el.offsetWidth/box.width : 1;
			/// position() is *seriously* slow, and worse in 3.2 than 2.x. It's odd because
			/// position() should just return offsetLeft/offsetTop.
			//box.x = el.position().left;
			//box.y = el.position().top;
			box.x = elLeft;
			box.y = elTop;
			box.width *= scale;
			box.height *= scale;
			/// Assuming all borders have same radius
			r = parseFloat(getComputedStyle(el)["border-top-left-radius"])*scale;
			/// get computed style broken (IMO). Returns specified
			/// border-radius (or 0 if not specified), not the one *actually* used to draw the border.
			if (r > box.width/2)  r = box.width/2;
			if (r > box.height/2)  r = box.height/2;
			box.borderRadius = r;
		}

		return box;
	},
	drawArrow(outputEl, from, to, opts = {}) {
		/// XXX This should be defaulted to false at some point. In fact, I'm
		/// not entirely sure the clickable area should even be in here.
		opts.clickable = opts.clickable===undefined ? true : opts.clickable;
		/// Include marker in the calculation (which means line is drawn short marker width)
		opts.withMarker = opts.withMarker===undefined ? true : opts.withMarker;
		var sx = sy = 10; //startX, startY
		var width = Math.abs(from.x - to.x);
		var height = Math.abs(from.y - to.y);

		var $path = null;
		var $svg = null;
		var insideSvg = $(outputEl)[0].tagName.toUpperCase() == "SVG";
		var existingPath = $(outputEl)[0].tagName.toUpperCase() == "PATH";
		
		if (existingPath) {
			$path = $(outputEl);
		}
		else if (insideSvg) {
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
		
		/// Compensate for the arrow head
		let markerGapX = 0;
		let markerGapY = 0;
		if (opts.withMarker) {
			let arrowLength = Math.sqrt(Math.pow(lastY-firstY,2)+Math.pow(lastX-firstX,2));
			if (arrowLength) {
				let scale = draw.arrowHeadGap/arrowLength;
				markerGapX = (lastX-firstX)*scale;
				markerGapY = (lastY-firstY)*scale;
				lastX -= markerGapX;
				lastY -= markerGapY;
			}
		}
		//markerGapX = 0;
		//markerGapY = 0;

		//onsole.debug(svgX, svgY);
		//var path = null;
		if (existingPath) {
			/*$path.attr('d', 
				"M "+(svgX-sx+firstX)+" "+(svgY-sy+firstY)+" L "+(svgX-sx+lastX)+" "+(svgY-sy+lastY)
			);*/
			$path[0].setAttribute('d', "M "+(svgX-sx+firstX)+" "+(svgY-sy+firstY)+" L "+(svgX-sx+lastX)+" "+(svgY-sy+lastY));
			if ($path.data("clickable") && $path.data("clickable").length) {
				/*$path.data("clickable").attr('d',
					"M "+(svgX-sx+firstX)+" "+(svgY-sy+firstY)+" L "+(svgX-sx+lastX+markerGapX)+" "+(svgY-sy+lastY+markerGapY)
				);*/
				$path.data('clickable')[0].setAttribute('d', "M "+(svgX-sx+firstX)+" "+(svgY-sy+firstY)+" L "+(svgX-sx+lastX+markerGapX)+" "+(svgY-sy+lastY+markerGapY));
			}
		}
		else if (insideSvg) {
			$svg.append($path = $(makeSvg("path", {
				d: "M "+(svgX-sx+firstX)+" "+(svgY-sy+firstY)+" L "+(svgX-sx+lastX)+" "+(svgY-sy+lastY),
				stroke: "black",
				"class": 'dependency',
				"stroke-width": 1,
				"marker-end": "url(#arrowhead)",
				'fill': 'none',
			})));
			if (opts.clickable) {
				var $clickable = null;
				$svg.append($clickable = $(makeSvg("path", {
					d: "M "+(svgX-sx+firstX)+" "+(svgY-sy+firstY)+" L "+(svgX-sx+lastX+markerGapX)+" "+(svgY-sy+lastY+markerGapY),
					stroke: "transparent",
					// Use following to view/debug
					//stroke: "red",
					"class": 'dependencyClickArea',
					"stroke-width": 7,
					'fill': 'none',
				})));
				$path.data("clickable", $clickable);
				$clickable.data("path", $path);
			}
		}
		else {
			$svg.append($path = $(makeSvg("path", {
				d: "M "+firstX+" "+firstY+" L "+lastX+" "+lastY,
				stroke: "black",
				"stroke-width": 1,
				"marker-end": "url(#arrowhead)"
			})))
				.css({left: svgX-sx, top: svgY-sy, position: "absolute"});
		}
		return $path;
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
	computeArrowBetweenBoxes(outputEl, par, child, opts = {}) {
		/// Include marker in the calculation (which means line is drawn short marker width)
		opts.withMarker = opts.withMarker || false;
		
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
			parIntersect = p1.intersectionWith(p2) || $V([parX, parY]);
			// The 0s are to make sylvester.js happy
			parSegment = [[par.x,par.y,0],[par.x,par.y+par.height,0]];
			// 0=topleft,1=topright,2=bottomright,3=bottomleft
			parSegment.corners = [0,3];
		}
		else if (angleBetween < Math.PI) {
			var p1 = $L([parX, parY], arrowVector),
				p2 = $L([par.x+par.width,par.y+par.height], [1,0]);
			parIntersect = p1.intersectionWith(p2) || $V([parX, parY]);
			parSegment = [[par.x,par.y+par.height,0],[par.x+par.width,par.y+par.height,0]];
			parSegment.corners = [3,2];
		}
		else if (angleBetween < Math.PI + angleBetweenDiags) {
			var p1 = $L([parX,parY], arrowVector),
				p2 = $L([par.x+par.width,par.y+par.height], [0,1]);
			parIntersect = p1.intersectionWith(p2) || $V([parX, parY]);
			parSegment = [[par.x+par.width,par.y,0],[par.x+par.width,par.y+par.height,0]];
			parSegment.corners = [1,2];
		}
		else {
			var p1 = $L([parX, parY], arrowVector),
				p2 = $L([par.x,par.y], [1,0]);
			parIntersect = p1.intersectionWith(p2) || $V([parX, parY]);
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
			childIntersect = p1.intersectionWith(p2) || $V([childX, childY]);
			// The 0s are to make sylvester.js happy
			childSegment = [[child.x,child.y,0],[child.x,child.y+child.height,0]];
			// 0=topleft,1=topright,2=bottomright,3=bottomleft
			childSegment.corners = [0,3];
		}
		else if (angleBetween < Math.PI) {
			var p1 = $L([childX, childY], arrowVector),
				p2 = $L([child.x+child.width,child.y+child.height], [1,0]);
			childIntersect = p1.intersectionWith(p2) || $V([childX, childY]);
			childSegment = [[child.x,child.y+child.height,0],[child.x+child.width,child.y+child.height,0]];
			childSegment.corners = [3,2];
		}
		else if (angleBetween < Math.PI + angleBetweenDiags) {
			var p1 = $L([childX,childY], arrowVector),
				p2 = $L([child.x+child.width,child.y+child.height], [0,1]);
			childIntersect = p1.intersectionWith(p2) || $V([childX, childY]);
			childSegment = [[child.x+child.width,child.y,0],[child.x+child.width,child.y+child.height,0]];
			childSegment.corners = [1,2];
		}
		else {
			var p1 = $L([childX, childY], arrowVector),
				p2 = $L([child.x,child.y], [1,0]);
			childIntersect = p1.intersectionWith(p2) || $V([childX, childY]);
			childSegment = [[child.x,child.y,0],[child.x+child.width,child.y,0]];
			childSegment.corners = [0,1];
		}

		/// Handle rounded borders
		function getRoundedIntersect(intersectPoint, box, segment) {
			var boxMidX = box.x + box.width/2;
			var boxMidY = box.y + box.height/2;

			var distEnd1 = intersectPoint.distanceFrom( $V(segment[0]) );
			var distEnd2 = intersectPoint.distanceFrom( $V(segment[1]) );
			console.log(distEnd1, distEnd2, box.borderRadius);
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

		let segment = [{x: parIntersect.e(1), y: parIntersect.e(2)}, {x: childIntersect.e(1), y: childIntersect.e(2)}];
		
		/// Compensate for the arrow head, if requested
		let markerGapX = 0;
		let markerGapY = 0;
		if (opts.withMarker) {
			let segmentLength = Math.sqrt(Math.pow(segment[1].y-segment[0].y,2)+Math.pow(segment[1].x-segment[0].x,2));
			if (segmentLength) {
				let scale = draw.arrowHeadGap/segmentLength;
				markerGapX = (segment[1].x-segment[0].x)*scale;
				markerGapY = (segment[1].y-segment[0].y)*scale;
				segment[1].x -= markerGapX;
				segment[1].y -= markerGapY;
			}
		}
		
		return segment;
	},
	drawArrowBetweenBoxes(outputEl, par, child, opts = {}) {
		outputEl = $(outputEl)[0];
		let existingPath = outputEl.tagName.toUpperCase() == "PATH";
		let pathData = null;
		/// Handle split points
		if (existingPath && opts.lockSplitPoints
				&& (pathData = outputEl.getPathData()).length > 2) {
			
			let a = pathData[1].values;
			let b = pathData[pathData.length-2].values;
			let secondPoint = {x: a[0], y: a[1], width: 0, height: 0};
			let secondLastPoint = {x: b[0], y: b[1], width: 0, height: 0};
			
			let segment1EndPoints = this.computeArrowBetweenBoxes(outputEl, par, secondPoint);
			let segment2EndPoints = this.computeArrowBetweenBoxes(outputEl, secondLastPoint, child, {withMarker: opts.withMarker});
			//onsole.log(opts);
			
			pathData[0].values = [segment1EndPoints[0].x, segment1EndPoints[0].y];
			pathData[pathData.length-1].values = [segment2EndPoints[1].x, segment2EndPoints[1].y];
			
			outputEl.setPathData(pathData);
		}
		else {
			let endPoints = this.computeArrowBetweenBoxes(outputEl, par, child);
			return $(draw.drawArrow(outputEl, endPoints[0], endPoints[1], opts));
		}
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
			x1 = c;
			x2 = c;
			if (r > (x1-cx)) {
				valid = true;

				y1 = sqrt(pow(r,2) - pow(x1-cx,2)) + cy;
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
	/// Yay, can soon drop
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

/// Inconsistencies between html and svg are very annoying
function makeSvg(tag, attrs) {
	var el= document.createElementNS('http://www.w3.org/2000/svg', tag);
	for (var k in attrs) {
		el.setAttribute(k, attrs[k]);
	}
	return el;
}

function getQs() {
	var params = {};
	var argSpecs = window.location.search.substring(1).split('&');
	if (window.location.search) {
		for (var i in argSpecs) {
			var argInfo = argSpecs[i].split('=');
			params[unescape(argInfo[0])] = unescape(argInfo[1]);
		}
	}
	return params;
}

if (typeof(window)!="undefined")  window.qs = getQs();

/// Loads the file of the given name/path from the server via XHR, and
/// then calls the callback
function loadFromServer(fileName, callback) {
	var format = fileName.replace(/^.*\.([^.]*)$/, '$1');
	if (!FILE_EXTENSIONS[format]) {
		format = "xdsl";
	}
	/// Handle binary differently to text
	let fileExtInfo = FILE_EXTENSIONS[format];
	if (fileExtInfo.text) {
		$.get(fileName, function(data) {
			let bn = new BN({source: data, outputEl: $(".bnview"), format: format, fileName: baseName(fileName), onload: callback});
			app.openBn(bn);
		}, "text");
	}
	else {
		let xhr = new XMLHttpRequest();
		xhr.open("GET", fileName, true);
		xhr.responseType = 'arraybuffer';
		xhr.onload = function() {
			let bn = new BN({source: xhr.response, outputEl: $(".bnview"), format: format, fileName: baseName(fileName), onload: callback});
			app.openBn(bn);
		};
		xhr.send();
	}
}

/** Dialogs **/
function popupDialog($a, opts) {
	var opts = opts || {};
	opts.buttons = opts.buttons || [];
	opts.className = opts.className || "";

	/// $a could be a string, element or jquery element
	$a = $("<div class=dialog>")
		.addClass(opts.className)
		.html($('<div class=content>').html($a))
		.appendTo("body");

	/// Add controls
	$a.append($('<div class=controls>').append(opts.buttons));

	var $veil = $("<div class=veil>").width($(window).width()).height($(window).height())
		.css({opacity: 0})
		.animate({opacity: 0.5}, 300)
		.appendTo($("body"));


	var w = $a.outerWidth(),
		h = $a.outerHeight();
	$a.css('display','flex').fadeIn(300);

	$a.css({left: (($(window).width() - w)/2)+"px"});
	$a.css({top:(($(window).height() - h)/2)+"px"});

	$a.data("veil", $veil);

	return $a;
}

function notifyError(msg) {
	popupDialog(msg+"<div class=controls><button type=button onclick=dismissDialogs()>OK</button></div>");
}

function notifyMessage(msg) {
	popupDialog(msg+"<div class=controls><button type=button onclick=dismissDialogs()>OK</button></div>");
}

function dismissDialog($a, callback) {
	$a.fadeOut(300);
	$a.data("veil").animate({opacity: 0}, 300, function() { $(this).hide(); if (typeof(callback)=="function")  callback(); });
	$a.data("veil").remove();
	$a.remove();
}

function dismissDialogs(callback) {
	var first = true;
	var $dialogs = $();
	$(".dialog:visible").each(function() {
		if ($(this).data("ondestroy")) {
			$(this).data("ondestroy")();
		}
		$dialogs.add(dismissDialog($(this), first ? callback : null));
		first = false;
	});
}

function nyi() {
	popupDialog('Not yet implemented :(', {buttons:[
		$('<button type=button>OK</button>').click(dismissDialogs),
	]});
}

function popupEditDialog($content, opts) {
	let $dialog = popupDialog($content, {
		className: 'contextMenu '+opts.className,
		buttons: [
			$('<button type=button class=saveButton disabled>').html('Save').on('click', function() {
				$(".dialog .saveButton")[0].disabled = true;
				console.log(whatsDirty);
				var controls = opts.controls;
				var success = true;
				for (var control in controls) {
					if (whatsDirty[control]) {
						whatsDirty[control] = false;
						/**
						Validity needs to be checked for all controls *first* (to avoid partial updates), but that's not
						the case right now.

						Currently, change events should be checked in order of failure priority.
						XXX: This needs fixing.
						*/
						if ($('.dialog *[data-control='+control+']').is('input, select, textarea')) {
							//var valid = $('.dialog *[data-control='+control+']').get().map(a=>$(a).is(':valid')).reduce((a,b)=>a && b);
							var valid = $('.dialog *[data-control='+control+']').get().map(function(a){return $(a).is(':valid')}).reduce(function(a,b){return a && b});
							if (valid) {
								var $control = $('.dialog *[data-control='+control+']');
								var val = $control.val();
								/// 'false' specifically means change didn't save
								if (controls[control].change(val, $control)===false) {
									$(".dialog .saveButton")[0].disabled = false;
									whatsDirty[control] = true;
									success = false;

									/// XXX: This needs fixing. Need validate all controls first.
									return false;
								}
							}
							else {
								/// XXX: This needs fixing. Need validate all controls first.
								return false;
							}
						}
						else {
							/// Non-standard control, just call with no arguments

							/// 'false' specifically means change didn't save
							if (controls[control].change($('.dialog *[data-control='+control+']'))===false) {
								$(".dialog .saveButton")[0].disabled = false;
								whatsDirty[control] = true;
								success = false;

								/// XXX: This needs fixing. Need validate all controls first.
								return false;
							}
						}
					}
				}
				if (success && opts.onsave) {
					opts.onsave();
				}
			}),
			$('<button type=button class=closeButton>').html('Close').on('click', function() {
				if (opts.onclose)  opts.onclose();
				dismissDialogs();
			}),
		],
	});
	$dialog.data("whatsDirty", {});
	var whatsDirty = $dialog.data("whatsDirty");
	$dialog.on("change keyup", function(event) {
		if ($(event.target).closest('*[data-control]').length) {
			var name = $(event.target).closest('*[data-control]').data('control');
			whatsDirty[name] = true;
		}
		$dialog.find(".saveButton")[0].disabled = false;
	});
	if (opts.ondestroy) {
		$dialog.data("ondestroy", opts.ondestroy);
	}
}
/** End Dialogs **/




/////////////////////////////////////////////////////
/// Add display capabilities to the BN, nodes, etc.
/////////////////////////////////////////////////////
Object.assign(DisplayItem.prototype, {
	__revisedMixin: true,
	/// Every DisplayItem in the GUI is associated with an element somewhere.
	/// The |displayItem| method is responsible for setting this.
	/// This will only return something valid if the element is visible!
	el() {
		return this._elCached ? this._elCached : $();
	},

	/// By default, assume a |net| (which should work fine for foreseeable future)
	changes() {
		return this.net.changes;
	},

	apiMoveTo: DisplayItem.prototype.moveTo,
	moveTo(x, y, withUndo = true) {
		if (withUndo) {
			this.changes().addAndDo({
				type: 'ItemMove',
				net: this.net,
				itemId: this.id,
				old: {...this.pos},
				new: {x, y},
				exec(current) {
					let item = this.net.find(this.itemId);
					item.apiMoveTo(current.x, current.y);
					item.el().css({left: item.pos.x, top: item.pos.y});
					if (item.isGraphItem())  this.net.redrawArcs(item.el());
				},
			});
		}
		else {
			let item = this;
			item.apiMoveTo(x, y);
			item.el().css({left: item.pos.x, top: item.pos.y});
			if (item.isGraphItem())  this.net.redrawArcs(item.el());
		}
	},

	/// No args toggles on/off. Or you can specify with {on:} or {off:}
	guiToggleSelect: function(o) {
		o = o || {};
		o.on = o.on || null;
		o.off = o.off || null;
		var bn = this.net;
		var itemId = this.id;

		if (o.on !== true && o.off !== false && (bn.selected.has(this) || o.off === true)) {
			bn.selected.delete(this);
			$("#display_"+itemId).removeClass("selected");
		}
		else {
			bn.selected.add(this);
			$("#display_"+itemId).addClass("selected");
		}
		bn.notifySelectionChanged();
	},
	
	guiToggleHighlight(type, o = {}) {
		let forceOff = o.on === false || o.off === true;
		let forceOn = o.on === true || o.off === false;
		let types = typeof(type)=='string' ? [type] : type;
		
		for (let type of types) {
			if (forceOff || (!forceOn && this.el().hasClass(type))) {
				this.el().removeClass(type);
			}
			else {
				this.el().addClass(type);
			}
		}
	},
	
	async guiFlashIntoView() {
		this.el()[0].scrollIntoView({block: 'nearest', behavior: 'smooth'});
		let times = 3;
		let pause = 200;
		for (let i=0; i<times; i++) {
			this.el().addClass('flash1').removeClass('flash2');
			await new Promise(r=>setTimeout(r,pause));
			this.el().addClass('flash2').removeClass('flash1');
			await new Promise(r=>setTimeout(r,pause));
		}
		this.el().removeClass('flash2');
	},

	/**
	NOTE: might be set of nodes (all things connected) or path
	nodes:
		- array of nodes: treated as node set rather than sequence/path
			- pass o.asPath = true to treat as path instead
		- array of arrays of nodes: treated as a set of paths
	*/
	highlightNodesWithOpacity(nodes, o = {}) {
		o.lowOpacity ??= 0.2;
		o.highOpacity ??= 1;
		o.asPath ??= false;
		let nodeLists = [];
		if (Array.isArray(nodes[0])) {
			nodeLists = nodes;
		}
		else {
			nodes = o.asPath ? nodes : new Set(nodes);
			nodeLists = [nodes];
		}
		
		/// Low-light all nodes and arcs
		this.nodes.forEach(n => n.el().css('opacity', o.lowOpacity));
		$('path.dependency').css('opacity', o.lowOpacity);
		
		for (let nodes of nodeLists) {
			/// High-light all chosen nodes, and arcs within nodes
			let prevNode = null;
			for (let node of nodes) {
				node.el().css('opacity', o.highOpacity);
				/// Highlight just as a path
				if (o.asPath) {
					if (prevNode && prevNode != node) {
						let pathInOut = node.pathsIn.find(p => p.parentItem == prevNode) ?? node.pathsOut.find(p => p.childItem == prevNode);
						$(pathInOut.arcSelector.path).css('opacity', o.highOpacity);
					}
				}
				/// Highlight any connections between the nodes
				else {
					node.pathsIn.forEach(p => nodes.has(p.parentItem) ? $(p.arcSelector.path).css('opacity', o.highOpacity) : null);
				}
				//node.parents.forEach(p => p.el().css('opacity', o.highOpacity));
				prevNode = node;
			}
		}
	},
	
	resetOpacities() {
		this.nodes.forEach(n => n.el().css('opacity', ''));
		$('path.dependency').css('opacity', '');
	},

	removePaths() {
		if (this.pathsIn) {
			for (let p of this.pathsIn) {
				let arcSelector = this.net.outputEl.find('#'+p.pathId).data('arcSelector');
				if (arcSelector)  arcSelector.removePath();
				let parentItemIndex = p.parentItem.pathsOut.findIndex(item => item.pathId == p.pathId);
				p.parentItem.pathsOut.splice(parentItemIndex,1);
			}
			this.pathsIn = [];
		}
		if (this.pathsOut) {
			for (let p of this.pathsOut) {
				let arcSelector = this.net.outputEl.find('#'+p.pathId).data('arcSelector');
				if (arcSelector)  arcSelector.removePath();
				let childItemIndex = p.childItem.pathsIn.findIndex(item => item.pathId == p.pathId);
				p.childItem.pathsIn.splice(childItemIndex,1);
			}
			this.pathsOut = [];
		}
	},

	isHidden() {
		let submodelHidden = true;
		if (this.net && this.submodelPath.join("/") == this.net.currentSubmodel.join("/")) {
			submodelHidden = false;
		}
		return this.isAlwaysHidden() || submodelHidden;
	},

	isVisible() {
		return !this.isHidden();
	},

	/// Some things are always hidden (e.g. engine only nodes)
	isAlwaysHidden() {
		return false;
	},

	/// Returns the item (e.g. submodel or node) that contains
	/// this item and is visible. Returns null if in a supermodel.
	getVisibleItem() {
		if (this.isAlwaysHidden())  return null;
		if (this.isVisible())  return this;
		/// If in a supermodel, it's not visible
		if (this.submodelPath.length < this.net.currentSubmodel.length)  return null;

		/// Make sure path matches current model
		for (let [i,currentPathEl] of this.net.currentSubmodel.entries()) {
			let pathEl = this.submodelPath[i];
			if (pathEl != currentPathEl)  return null;
		}
		/// Return matching submodel
		return this.net.getSubmodel(this.submodelPath.slice(0, this.net.currentSubmodel.length+1));
	},

	getPathIn(parent) {
		return this.pathsIn.find(pi => pi.parentItem.id == parent.id);
	},

	getPathOut(child) {
		return child.getPathIn(this);
	},
	
	guiMoveToSubmodelVisual() {
		/// If the item has disappeared from the current view
		if (!this.isVisible()) {
			this.removePaths();
			this.el().remove();
			this.net.updateArcs(this.net.getSubmodel(this.submodelPath));
		}
		/// If the this has appeared in the current view
		else {
			this.displayItem();
			if (this.displayBeliefs)  setTimeout(_=> this.displayBeliefs(), 0);
			this.net.updateArcs(this);
		}
	},
	
	guiMoveToSubmodel(pathOrSubmodel) {
		let path = pathOrSubmodel;
		if (pathOrSubmodel instanceof Submodel) {
			path = pathOrSubmodel.submodelPath.concat([pathOrSubmodel.id]);
		}
		
		this.net.changes.addAndDo({
			itemId: this.id,
			net: this.net,
			old: this.submodelPath.slice(),
			new: path.slice(),
			exec(current) {
				let item = this.net.find(this.itemId);
				
				item.moveToSubmodel(current);
				item.guiMoveToSubmodelVisual();
				/// If the item has disappeared from the current view
				/*if (!item.isVisible()) {
					item.removePaths();
					item.el().remove();
					this.net.updateArcs(this.net.getSubmodel(current));
				}
				/// If the item has appeared in the current view
				else {
					item.displayItem();
					if (item.displayBeliefs)  setTimeout(_=> item.displayBeliefs(), 0);
					this.net.updateArcs(item);
				}*/
				//this.net.display();
				//this.net.displayBeliefs();
			},
		});
	}
});

/// You can't replace a constructor (called by 'new') by overwriting
/// the 'constructor' property on the prototype.
/// You have to rebind the variable name to something new.
BN = class extends BN {
	static DisplayItem = addMixin(this, DisplayItem);
	constructor(...args) {
		super(...args);
		this.saveListeners = [];
		
		/// Meeting point for any type of listener on this object
		this.listeners = new Listeners();
		
		/// Whether to show related nodes when selected a node (and what type of related nodes)
		/// parent|child|etc. and anything supported by |getRelated|
		this.showRelationType = null;

		/// Track changes to the BN
		this.changes = new UndoList();
		this.unsavedChanges = false;
		/// Make this much less hacky (if it's in the prototype, the "addMixin" call will override it)
		this.el = function() { return document.querySelector('.bnview'); }
	}
}
/*var apiBN = BN;
BN = function(...args) {
	apiBN.call(this, ...args);
	this.saveListeners = [];
	
	/// Meeting point for any type of listener on this object
	this.listeners = new Listeners();
	
	/// Whether to show related nodes when selected a node (and what type of related nodes)
	/// parent|child|etc. and anything supported by |getRelated|
	this.showRelationType = null;

	/// Track changes to the BN
	this.changes = new UndoList();
	this.unsavedChanges = false;
	/// Make this much less hacky (if it's in the prototype, the "addMixin" call will override it)
	this.el = function() { return document.querySelector('.bnview'); }
};
Object.assign(BN, apiBN);
BN.prototype = apiBN.prototype;*/
Object.assign(BN.prototype, {
	/// Make this less hacky
	//el() { return document.querySelector('.bnview'); },
	runSaveListeners(event) {
		event.bn = this;
		this.saveListeners.forEach(listener => listener(event));
	},
	setUnsavedChanges(unsavedChanges) {
		if (this.unsavedChanges != unsavedChanges) {
			this.unsavedChanges = unsavedChanges;
			app.updateBnName();
		}
	},
	/// label|statesOnly|distro
	setNodeView(type) {
		this.nodeDisplayStyle = type;
		let nodes = this.selected.size ? [...this.selected].filter(item => item._type == 'Node') 
		                               : this.outputEl.find('.node').toArray().map(el => this.findItem(el)); 
		nodes.forEach(n => {
			n.updateObject({format:{displayStyle:type}});
			/*n.dataset.displayStyle = 
			if (!n.dataset.displayStyle) {
				removeMatchingClasses(n, c => c.startsWith('ds_'));
				n.classList.add('ds_'+type);
			}*/
		});
	},
	guiOpenSubmodel(submodelPath) {
		submodelPath = BN.makeSubmodelPath(submodelPath);
		for (let item of this.getVisibleItems()) {
			item.removePaths();
		}
		currentBn.currentSubmodel = submodelPath;
		currentBn.display();
		currentBn.displayBeliefs();
	},
	guiAddNode(id, states, opts) {
		let node = null;

		this.changes.addAndDo({
			net: this,
			node: null,
			/*opts: {...pick(opts, ...'def pos size label type comment format submodelPath values'.split(/\s+/)),
					...{parents: BN.getIds(opts.parents), children: BN.getIds(opts.children)}},*/
			name: "Add Node",
			redo(current) {
				if (!this.node)  this.node = this.net.addNode(id, states, opts);
				else             this.node.addToNet(this.net);

				if (!this.node.isHidden()) {
					this.node.displayItem(this.net.outputEl);
					this.net.updateArcs(this.node);
				}
				node = this.node;
			},
			undo(current) {
				this.node.guiDelete();
			},
		});
		
		return node;
	},
	guiAddSubmodel(id, opts) {
		let submodel = null;
		
		this.changes.addAndDo({
			net: this,
			submodel: null,
			opts: {...opts},
			redo(current) {
				if (!this.submodel)  this.submodel = this.net.addSubmodel(id, this.opts);
				else                 this.submodel.addToNet(this.net);
				if (!this.submodel.isHidden()) {
					this.submodel.displayItem(this.net.outputEl);
					//this.net.updateArcs(this.submodel);
				}
				submodel = this.submodel;
			},
			undo(current) {
				this.submodel.guiDelete();
			},
		});
		
		return submodel;
	},
	guiAddTextBox(text, opts) {
		let textBox = null;
		
		this.changes.addAndDo({
			net: this,
			textBox: null,
			opts: {...opts},
			redo(current) {
				if (this.textBox == null)  this.textBox = this.net.addTextBox(text, this.opts);
				else                       this.net.addTextBox(this.textBox);

				this.textBox.displayItem(this.net.outputEl);
				textBox = this.textBox;
			},
			undo(current) {
				this.textBox.guiDelete();
			},
		});
		
		return textBox;
	},
	guiAddImageBox(text, opts) {
		let imageBox = null;
		
		this.changes.addAndDo({
			net: this,
			imageBox: null,
			opts: {...opts},
			redo(current) {
				if (this.imageBox == null)  this.imageBox = this.net.addImageBox(text, this.opts);
				else                        this.net.addImageBox(this.imageBox);

				this.imageBox.displayItem(this.net.outputEl);
				imageBox = this.imageBox;
			},
			undo(current) {
				this.imageBox.guiDelete();
			},
		});
		
		return imageBox;
	},
	guiUpdateAndDisplayForLast(outputEl, callback) {
		this.changes.last().addFinallyAndDo(_=> {
			console.log('START COMPILE/DISPLAY');
			this.compile({force:true});
			this.updateAndDisplayBeliefs(outputEl, callback);
			console.log('END COMPILE/DISPLAY');
		});
	},
	updateAndDisplayBeliefs: function(outputEl, callback) {
		var bn = this;
		var start = performance.now();
		var inferenceTime = null;
		function displayPerf(totalIterationsRun) {
			var durationMs = (performance.now() - start);
			if ($(".status .duration").length==0) {
				$(".status").append("<span class=duration title='Time taken for last computation'>Last: <span class=val></span>ms (Display: <span class=displayVal></span>ms)</span>");
			}
			$(".status .duration .val").text(Math.round(inferenceTime*1000)/1000);
			$(".status .duration .displayVal").text(Math.round((durationMs-inferenceTime)*1000)/1000);
			if (totalIterationsRun) {
				if ($(".status .iterations").length==0) {
					$(".status").append('<span class=iterations title="Number of iterations for last computation">Iterations: <span class=val></span></span>');
				}
				$(".status .iterations .val").text(totalIterationsRun);
			}
			if ($(".status .method").length == 0) {
				$(".status").append("<span class=method title='Inference method used'></span>");
			}
			$('.status .method').text(bn.updateMethodActualTitle);
			$('.status .numNodes').text(`${bn.nodes.length} nodes`);

		}
		this.updateBeliefs((bn, totalIterationsRun) => {
			inferenceTime = performance.now() - start;
			bn.displayBeliefs(outputEl);
			displayPerf(totalIterationsRun);
			if (callback)  callback(bn);
		});
		/*
		if (this.useWorkers) {
			this.updateBeliefs_worker((bn, totalIterationsRun) => {
				inferenceTime = performance.now() - start;
				bn.displayBeliefs(outputEl);
				displayPerf(totalIterationsRun);
				if (callback)  callback(bn);
			});
		}
		else {
			this.updateBeliefs((bn, totalIterationsRun) => {
				inferenceTime = performance.now() - start;
				bn.displayBeliefs(outputEl);
				displayPerf(totalIterationsRun);
				if (callback)  callback(bn);
			});
		}*/
	},
	displayBeliefs: function(outputEl) {
		outputEl = outputEl || this.outputEl;
		/// If any node needs to update display, update the full display
		/// (in case layout has changed)
		var redrawArcs = false;
		for (var node of this.nodes) {
			if (node._updateDisplay) {
				redrawArcs = true;
				break;
			}
		}
		for (let node of this.nodes) {
			if (node.slice != 0)  break;

			node.displayBeliefs();
		}

		if (this._utilityNodes.length) {
			if (!$(".status .expectedValue").length) {
				$(".status").append('<span class=expectedValue title="Expected value (or utility) of the current network">Expected value: <span class=val></span></span>');
			}
			$(".status .expectedValue .val").text(mbConfig.sigFig(this.expectedValue));
		}
		
		if (redrawArcs) {
			this.redrawAllArcs();
		}

		if (this._trackingArcInfluences) {
			this.displayArcsWithInfluences();
		}
	},
	headerFormat: function(id, label) {
		return label ? label : id;
	},
	/** For all or a subset of the *visible* graph items, update all arcs (remove old/update existing/add new).
		This can be used to update existing AND (of course) old/new arcs. **/
	updateArcs(graphItems = null) {
		/// Default to visible items
		if (!graphItems)  graphItems = this.getVisibleItems();
		/// Treat 1 item like a list
		if (!Array.isArray(graphItems))  graphItems = [graphItems];
		/// Filter out non-graph items (i.e. things that don't have arcs)
		graphItems = graphItems.filter(g => g.isGraphItem());

		let graphItemSet = new Set(graphItems);
		let currentSub = this.getSubmodel(this.currentSubmodel);
		
		/// For any submodel in the current view, setup parents and children
		for (let graphItem of Object.values(currentSub.submodelsById)) {
			graphItem.parents = [];
			graphItem.dynamicParents = [];
			graphItem.children = [];
			for (let node of graphItem.getAllNodes()) {
				graphItem.parents.push(...node.parents);
				graphItem.children.push(...node.children);
			}
		}
		
		/// For any graphItems for which a submodel container is in the current view
		/// replace with that submodel container
		for (let graphItem of graphItemSet) {
			for (let sub of Object.values(currentSub.submodelsById)) {
				if (sub.includes(graphItem)) {
					graphItemSet.delete(graphItem);
					graphItemSet.add(sub);
				}
			}
		}
		
		for (let graphItem of [...graphItemSet]) {
			if (graphItem.parents)  graphItemSet = new Set([...graphItemSet, ...graphItem.parents]);
			if (graphItem.children)  graphItemSet = new Set([...graphItemSet, ...graphItem.children]);
			if (graphItem.pathsIn) {
				graphItemSet = new Set([...graphItemSet, ...graphItem.pathsIn.map(pi => pi.parentItem)]);
			}
			if (graphItem.pathsOut) {
				graphItemSet = new Set([...graphItemSet, ...graphItem.pathsOut.map(po => po.childItem)]);
			}
		}
		
		/// For any graphItems for which a submodel container is in the current view
		/// replace with that submodel container (Pass 2)
		for (let graphItem of graphItemSet) {
			for (let sub of Object.values(currentSub.submodelsById)) {
				if (sub.includes(graphItem)) {
					graphItemSet.delete(graphItem);
					graphItemSet.add(sub);
				}
			}
		}

		/// If one of the graph items is, in fact, the whole BN, update arcs for all visible items
		if (graphItemSet.has(this))  graphItemSet = new Set(this.getVisibleItems());
		
		this.updateParentArcs([...graphItemSet]);

		/// Remove temporary parents from submodels
		for (let graphItem of Object.values(currentSub.submodelsById)) {
			delete graphItem.parents;
			delete graphItem.dynamicParents;
			delete graphItem.children;
		}
	},
	/** For a subset of graph items, update just the parent arcs. (Not typically useful...) **/
	updateParentArcs(graphItems) {
		if (!Array.isArray(graphItems))  graphItems = [graphItems];
		var bn = this;
		
		/// Filter out invisibles
		graphItems = graphItems.filter(item => item.isVisible());
		
		function __temp_removePath(p) {
			if ($(`path#${p.pathId}`).length) {
				$(`path#${p.pathId}`).data('arcSelector').removePath();
			}
			let parentItem, childItem;
			if (p.parentItem) {
				parentItem = p.parentItem;
				childItem = p.graphItem;
			}
			else {
				parentItem = p.graphItem;
				childItem = p.childItem;
			}
			let index = parentItem.pathsOut.findIndex(pathOut => pathOut.pathId == p.pathId);
			parentItem.pathsOut.splice(index,1);
			index = childItem.pathsIn.findIndex(pathIn => pathIn.pathId == p.pathId);
			childItem.pathsIn.splice(index,1);
		}
		
		/// Need to reset pathsIn/pathsOut first
		for (var i=0; i<graphItems.length; i++) {
			var graphItem = graphItems[i];
			graphItem.pathsIn
				.filter(p => graphItems.includes(p.parentItem))
				.forEach(p => __temp_removePath(p));
			graphItem.pathsOut
				.filter(p => graphItems.includes(p.childItem))
				.forEach(p => __temp_removePath(p));
			// console.log('before', graphItem.id, graphItem.pathsIn, graphItem.pathsOut);
			graphItem.pathsIn = 
				graphItem.pathsIn.filter(p => !graphItems.includes(p.parentItem));
			graphItem.pathsOut =
				graphItem.pathsOut.filter(p => !graphItems.includes(p.childItem));
			// console.log('after', graphItem.id, graphItem.pathsIn, graphItem.pathsOut);
		}
		
		let pathsToDraw = [];

		/// Before doing anything else, work out what the pathsIn/pathsOut are (with blank elements for the actual arcs)
		for (var ni=0; ni<graphItems.length; ni++) {
			var graphItem = graphItems[ni];
			if (graphItem.isHidden())  continue;

			/// All graphItems should have parents/dynamicParents (e.g. incl. submodels,
			/// which have been especially set up with them just for the following)
			var parents = graphItem.parents.concat(graphItem.dynamicParents);
			if (parents.length) {
				for (var i=0; i<parents.length; i++) {
					/// Clarify: Parents will be an array if from dynamicParents, maybe?
					var parent = Array.isArray(parents[i]) ? parents[i][0] : parents[i];
					if (parent.isAlwaysHidden())  continue;
					
					/// Skip if the arc is already on the canvas
					if (graphItem.pathsIn.find(p => p.parentItem.id == parent.id))  continue;

					/// If parent belongs to a descendent submodel, need to deal with it differently
					var j=0;
					for (; j<parent.submodelPath.length; j++) {
						if (parent.submodelPath[j] != bn.currentSubmodel[j])  break;
					}
					/// This means parent is in currently displayed submodel, or a descendent.
					/// Only draw arcs for these cases.
					if (j == bn.currentSubmodel.length) {
						/// This means parent is strictly in a descendent submodel
						if (parent.submodelPath.length > j) {
							/// Sub in the submodel as the parent!
							parent = bn.getSubmodel(parent.submodelPath.slice(0,j+1));
						}
						/// Now that parent has changed, we need to re-check if arc is already on the canvas
						if (graphItem.pathsIn.find(p => p.parentItem.id == parent.id))  continue;

						/// If parent was one of the items to include in the arc drawing,
						/// then draw the arc
						if (parent.id != graphItem.id && graphItems.includes(parent)) {
							graphItem.pathsIn.push({pathId: null, graphItem: graphItem,
								parentItem: parent,
								get arcSelector() {
									return this.graphItem.net.outputEl.find('#'+this.pathId).data('arcSelector');
								},
							});
							parent.pathsOut.push({pathId: null, graphItem: parent,
								childItem: graphItem,
								get arcSelector() {
									return this.graphItem.net.outputEl.find('#'+this.pathId).data('arcSelector');
								},
							});
							/// Add this to the list of arcs to draw
							// console.log("Drawing:", parent.id, "->", graphItem.id);
							pathsToDraw.push(graphItem.pathsIn[graphItem.pathsIn.length-1]);
						}
					}
				}
			}
		}

		/// Draw all the arcs
		let maxX = $('.netSvgCanvas').attr('width');
		let maxY = $('.netSvgCanvas').attr('height');
		for (let pathIn of pathsToDraw) {
			let {graphItem,parentItem} = pathIn;
			let parentBox = draw.getBox($('#display_'+parentItem.id));
			let childBox = draw.getBox($('#display_'+graphItem.id));
			let path = draw.drawArrowBetweenBoxes($(".netSvgCanvas"), parentBox, childBox);
			maxX = Math.max(maxX, parentBox.right, childBox.right);
			maxY = Math.max(maxY, parentBox.bottom, childBox.bottom);

			/// Now we need to populate the pathsIn/pathsOut references
			let pathId = (""+Math.random()).replace(/\./, '_');
			$(path).attr("id", pathId);
			$(path).data('arcSelector', new ArcSelector($(path)));
			pathIn.pathId = pathId;
			parentItem.pathsOut.find(pathOut => pathOut.childItem.id == pathIn.graphItem.id).pathId = pathId;
			/// And ... we need to specify the endpoints for this path
			$(path).data('endpoints', [parentItem, graphItem]);
			/// And stick on a class for easy css selection
			$(path).addClass(`arc-${parentItem.id}-${graphItem.id}`);
		}
		$('.netSvgCanvas').attr('width', maxX);
		$('.netSvgCanvas').attr('height', maxY);
	},
	display(outputEl, {items = null} = {}) {
		var bn = this;
		outputEl = outputEl || this.outputEl;
		if (!outputEl)  outputEl = this.outputEl = $('.bnview');
		if (items) {
			for (let item of items) {
				if (item.el())  item.el().remove();
			}
		}
		else {
			items = bn.getDisplayItems();
			outputEl.empty();
		}
		var displayItems = {};
		var nodeBeliefs = this.getAllBeliefs();
		/// Setup an SVG canvas on which to draw things. At this stage,
		/// this will just be arrows.
		/// Need to wait for nodes to be drawn before we know size
		let canvasWidth = 10, canvasHeight = 10;
		let $netCanvas = outputEl.find('.netSvgCanvas');
		if (!$netCanvas.length) {
			$netCanvas = draw.createSvg(outputEl, 0, 0, canvasWidth, canvasHeight, "netSvgCanvas");
		}
		else {
			canvasWidth = $netCanvas.width();
			canvasHeight = $netCanvas.height();
		}

		/// Draw all the graphItems visible in the current submodel
		/// or just those specific items requested
		graphItems = bn.getGraphItems().filter(gi => items.includes(gi));
		
		/// Since |display| destroys everything, need to clear out
		/// any old graphItem paths
		/*for (var i=0; i<graphItems.length; i++) {
			var graphItem = graphItems[i];
			graphItem.pathsIn = [];
			graphItem.pathsOut = [];
		}*/
		
		/*

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
		}*/

		var maxX = canvasWidth;
		var maxY = canvasHeight;
		for (var i=0; i<graphItems.length; i++) {
			var graphItem = graphItems[i];
			if (graphItem.isHidden())  continue;

			var $displayItem = graphItem.displayItem(outputEl);
			/// This is kinda hacky, and will change once I enable individual
			/// node views
			/// 2020-11-18 SM: Hasn't changed yet...
			if (graphItem instanceof Node) {
				if (!graphItem.format.displayStyle && this.nodeDisplayStyle)  $displayItem.addClass('ds_'+this.nodeDisplayStyle);
			}
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
		for (let item of bn.basicItems) {
			if (item.isHidden() || !items.includes(item)) continue;

			item.displayItem(outputEl);
		}

		this.updateArcs(graphItems);

		/*/// Draw all the arcs
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
		}*/

		/// Resize the SVG
		//console.log(maxX, maxY);
		$(".netSvgCanvas").attr("width", maxX + CANVASPAD).attr("height", maxY + CANVASPAD);

		/// Not sure this belongs here. I'm thinking |display()| should just be
		/// responsible for displaying the BN graph, not associated extras
		if (bn.updateViewer) {
			$(".status").html('<span class=numNodes>'+bn.nodes.length+" nodes</span>");
			bn.showComment();
			app.updateBnName(bn);
			app.makeEvidenceMenu(bn.evidenceSets);
		}
		
		if (this.doAutoLayout) {
			app.autoLayout();
		}

		/// Updated, so not needed any more
		bn.updateViewer = false;
	},
	/// |redrawArcs| is only for *existing* arcs. It won't delete arcs, or add
	/// arcs (because it doesn't have access to the BN information)
	/// opts.moved allows one to indicate the redraw is due to a movement (translation)
	/// of all graphItems together. This allows arcs with split points to be moved without
	/// deleting split points.
	redrawArcs(graphItems, width = null, height = null, opts = {}) {
		opts.padding = opts.padding!==undefined ? opts.padding : CANVASPAD;
		//Option: opts.moved = {deltaX, deltaY}
		if (!Array.isArray(graphItems))  graphItems = [graphItems];
		
		if (!width) {
			// console.trace();
			// console.log('no width height');
			width = parseFloat($(".netSvgCanvas").attr("width"));
			height = parseFloat($(".netSvgCanvas").attr("height"));
		}
		
		/// Find the maxX and maxY for the canvas as a whole
		let maxX = width;
		let maxY = height;
		/// Find the paths that need updating. Divide into those inside graphItems,
		/// and those with a connection outside
		let internalArcs = new Set();
		let externalArcs = new Set();
		for (let gi=0; gi<graphItems.length; gi++) {
			let graphItem = this.findItem(graphItems[gi]);
			for (let i=0; i<graphItem.pathsIn.length; i++) {
				externalArcs.add(graphItem.pathsIn[i].arcSelector);
			}
		}
		for (let gi=0; gi<graphItems.length; gi++) {
			let graphItem = this.findItem(graphItems[gi]);
			
			for (let i=0; i<graphItem.pathsOut.length; i++) {
				let arc = graphItem.pathsOut[i].arcSelector;
				if (externalArcs.has(arc)) {
					externalArcs.delete(arc);
					internalArcs.add(arc);
				}
				else {
					externalArcs.add(arc);
				}
			}
			
			/// Update max x/y as extents for canvas if necessary
			var b = draw.getBox(graphItem.el());
			maxX = Math.max(maxX, b.x+b.width + opts.padding);
			maxY = Math.max(maxY, b.y+b.height + opts.padding);
		}
		//onsole.log(internalArcs, externalArcs);
		for (let arc of internalArcs) {
			if (opts.moved) {
				let pathData = arc.path.getPathData();
				for (let point of pathData) {
					point.values[0] += opts.moved.deltaX;
					point.values[1] += opts.moved.deltaY;
					
					maxX = Math.max(maxX, point.values[0] + opts.padding);
					maxY = Math.max(maxX, point.values[0] + opts.padding);
				}
				arc.path.setPathData(pathData);
				arc.clickable.setPathData(pathData);
			}
			/// If not just a translation of full group, need to redraw everything
			else {
				let [parent, child] = arc.getEndpoints();
				draw.drawArrowBetweenBoxes(arc.path, parent, child, {lockSplitPoints: true, withMarker: true});
			}
		}
		/// External arcs always need to be redrawn
		for (let arc of externalArcs) {
			let [parent, child] = arc.getEndpoints();
			draw.drawArrowBetweenBoxes(arc.path, draw.getBox(parent.el()), draw.getBox(child.el()), {lockSplitPoints: true, withMarker: true});
		}
		
		if (maxX != width || maxY != height) {
			$(".netSvgCanvas").attr("width", maxX).attr("height", maxY);
		}
		
		return {maxX, maxY};
	},
	removeTrackArcInfluences: function() {
		var nodesToRemove = [];
		for (var i=0; i<this.nodes.length; i++) {
			if (this.nodes[i].id.search(/^__mutualInfo_/)!=-1) {
				nodesToRemove.push(this.nodes[i]);
			}
		}
		for (var i=0; i<nodesToRemove.length; i++) {
			var node = nodesToRemove[i];
			node.delete();
		}
		/// Reset all arcs to width 1
		$('.dependency').css('stroke-width', '1px');

		this._trackingArcInfluences = false;
	},
	displayArcsWithInfluences: function() {
		var sumMis = {};
		var sumChildEntropies = {};
		for (var i=0; i<this.nodes.length; i++) {
			var node = this.nodes[i];
			if (node.engineOnly)  continue;
			for (var j=0; j<node.children.length; j++) {
				var child = node.children[j];
				if (child.engineOnly)  continue;

				/// The very objects themselves should be the same, but test by id anyway,
				/// in case some transformation happens (in a future version).
				var miNode = node.children.find(
					v => v.id.search(/^__mutualInfo_/)!=-1
					&& v.parents[0].id==node.id
					&& v.parents[1].id==child.id
				);
				console.log(miNode);
				var childEntropy = 0;
				for (var k=0; k<child.states.length; k++) {
					childEntropy += -(child.beliefs[k] * Math.log2(child.beliefs[k]));
				}
				var mi = 0;
				for (var k=0; k<miNode.states.length; k++) {
					var Pxy = miNode.beliefs[k];
					var Px = node.beliefs[Math.floor(k/child.states.length)];
					var Py = child.beliefs[k % child.states.length];
					console.log(Pxy, Px, Py);

					if (Pxy==0 || Px==0 || Py==0)  continue;

					var pMi = Pxy * Math.log2(Pxy/(Px*Py));
					mi += pMi;
				}
				console.log("MI:", mi, "Entropy of child:", childEntropy);

				/// Find the item (either node or submodel) that is visible in
				/// the current submodel and corresponds to the current child --- if there is one
				var item = child;
				do {
					if (item.isVisible())  break;

					item = this.getSubmodel(item.submodelPath);
				} while (item.submodelPath.length > 0);

				/// Update the arc with representation of the MI influence
				/// Find the right arc
				var arcInfo = node.pathsOut.find(p => p.childItem.id == item.id);
				/// If we can't find arcInfo, it's
				if (arcInfo) {
					var arc = $("#"+arcInfo.pathId);
					if (!(arcInfo.pathId in sumMis)) {
						sumMis[arcInfo.pathId] = 0;
						sumChildEntropies[arcInfo.pathId] = 0;
					}
					/// Update arc width based on MI influence
					var entropyProportion = 0;
					sumMis[arcInfo.pathId] += mi;
					sumChildEntropies[arcInfo.pathId] += childEntropy;
					if (sumChildEntropies[arcInfo.pathId] > 0) {
						entropyProportion = sumMis[arcInfo.pathId]/sumChildEntropies[arcInfo.pathId];
					}
					var minVal = 0.02;
					if (entropyProportion > minVal) {
						console.log("stroke", (entropyProportion*10)+"px");
						arc.css('stroke-width', (entropyProportion*10)+"px");
					}
					else {
						console.log("minStroke", (entropyProportion*10)+"px");
						arc.css('stroke-width', minVal+"px");
					}
				}
			}
		}
	},
	/// Don't use this function
	showArcInfluences: function() {
		var bn = this;
		this.trackArcInfluences();
		this.updateBeliefs(function() {
			bn.displayArcsWithInfluences();
			/// FIX: Remove arc influences
		});
	},
	addListener(type, func) {
		/*if (!this.listeners[type])  this.listeners[type] = [];
		/// Can only add func once?
		this.listeners[type].push(func);*/
		return this.listeners.add(type, func);
	},
	getListeners(type) {
		//return this.listeners[type] ?? [];
		return this.listeners.get(type);
	},
	removeListener(type, func) {
		/*if (!this.listeners[type])  return;
		this.listeners[type].splice(this.listeners[type].indexOf(func),1);*/
		this.listeners.remove(type, func);
	},
	notifyEvidenceChanged(o = {}) {
		this.updateShowRelated();
		this.listeners.notify('evidenceChange change');
	},
	notifyStructureChanged(o = {}) {
		this.updateShowRelated();
		this.listeners.notify('structureChange change');
	},
	notifyDefinitionsChanged(o = {}) {
		this.updateAndDisplayBeliefs();
		this.updateShowRelated(o);
		this.listeners.notify('definitionsChange change');
	},
	notifySelectionChanged(o = {}) {
		this.updateShowRelated(o);
		this.listeners.notify('selectionChange change');
	},
	updateShowRelated(o = {}) {
		o.forceClear ??= false;
		o.highlightMode ??= currentBn.showRelationHighlightMode ?? 'highlight'; // or 'opacity'
		
		if (this.showRelationType || o.forceClear) {
			/// Clear all highlights first
			if (o.highlightMode == 'highlight') {
				this.guiToggleHighlights('related', {off:true});
			}
			else if (o.highlightMode == 'opacity') {
				this.resetOpacities();
			}
		}
		if (this.showRelationType) {
			let nodes = [];
			let asPath = false;
			if (this.showRelationType=='selection') {
				nodes = [...this.selected];
			}
			else {
				let allItems = [...this.selected].filter(item => item.isGraphItem());
				for (let item of allItems) {
					/// For graph items only, look for and highlight relations
					// if (item.isGraphItem()) {
						let rel = item.getRelated(this.showRelationType, allItems);
						asPath = !!rel.paths;
						nodes.push(...(rel.paths ?? rel));
						if (!asPath && o.highlightMode != 'highlight') {
							nodes.push(item);
						}
					// }
				}
				nodes = [...new Set(nodes)];
			}
			if (o.highlightMode == 'highlight') {
				nodes.forEach(p => p.guiToggleHighlight('related', {on:true}));
			}
			else {
				//console.log(nodes.map(n => n.id));
				this.highlightNodesWithOpacity(nodes, {asPath});
			}
		}
	},
	/// Toggle highlights of type |type| for all items in the BN. Force to on/off using o = {on:true}
	guiToggleHighlights(type, o = {}) {
		for (let item of this.getDisplayItems()) {
			item.guiToggleHighlight(type, o);
		}
	},
	/// Given a DOM element, find appropriate associated item
	findItem(el) {
		if (el && el.net == this)  return el;
		var $el = $(el).closest('.node, .submodel, .textBox, .imageBox');
		if ($el.length) {
			var id = $el[0].id.replace(/^display_/, '');
			return currentBn.getGraphItemById(id);
		}
		return null;
	},
	getDisplayItems() {
		return [...this.getGraphItems(), ...this.basicItems];
	},
	getVisibleItems() {
		return this.getDisplayItems().filter(i => i.isVisible());
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
		for (var i=0; i<this.basicItems.length; i++) {
			if (this.basicItems[i].id == id)  return this.basicItems[i];
		}
		return null;
	},
	getElementFromItem: function(idOrItem, $outputEl = null) {
		var id = idOrItem;
		if (idOrItem.id) {
			id = idOrItem.id;
		}
		$outputEl = $outputEl || $('.bnview');
		return $outputEl.find('#display_'+id);
	},
	/// |redrawAllArcs| is only for *existing* arcs. It won't delete arcs, or add
	/// arcs (because it doesn't have access to the BN information)
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
	getVisibleBounds() {
		var minX = 10e9;
		var minY = 10e9;
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
			minX = Math.min(minX, b.x-b.width);
			minY = Math.min(minX, b.x-b.width);
			maxX = Math.max(maxX, b.x+b.width);
			maxY = Math.max(maxY, b.y+b.height);
		}
		return {minX, minY, maxX, maxY};
	},
	measureCanvasNeeds: function() {
		let b = this.getVisibleBounds();
		return {maxX: b.maxX, maxY: b.maxY};
	},
	resizeCanvasToFit: function() {
		var m = this.measureCanvasNeeds();
		$(".netSvgCanvas").attr("width", m.maxX).attr("height", m.maxY);
	},
	showSidebar(doShow) {
		doShow ??= !!$('.sidebar .boxes')[0].childElementCount;
		$(".sidebar").animate({width:doShow?'show':'hide'},350);
	},
	addBoxToSidebar(el, o = {}) {
		o.class ??= '';
		o.onclose ??= o.on_close ?? (_=>{});
		o.title ??= '';
		let $parEl = $('<div>').attr('class', 'box '+o.class);
		$parEl.data('onclose', o.onclose);
		$parEl.append(n('div.titlebar',
			n('span.title', o.title),
			n('span.close', n('button', {type:'button',on:{click:e=>currentBn.closeSidebarBox(e.target)}}, 'X')),
		));
		// $("<div class=titlebar><span class=title></span><div class=close><button type=button onclick='currentBn.closeSidebarBox(this)'>X</button></div></div>"));
		$parEl.append(el);
		$('.sidebar > .boxes').append($parEl);
		this.showSidebar();
	},
	closeSidebarBox(el) {
		if ($(el).closest('.box').data('onclose')) $(el).closest('.box').data('onclose')(el);
		el.closest('.box').remove();
		this.showSidebar();
	},
	clearSidebar() {
		qa('.sidebar .boxes > .box').forEach(el=>this.closeSidebarBox(el));
		this.showSidebar();
	},
	showComment: function(doShow, {force} = {force:false}) {
		var bn = this;
		doShow = doShow===undefined ? true : doShow;
		if (doShow && !$('.sidebar .comment').length) {
			var hasChanges = false;
			let $comment = $("<div class=comment contenteditable=true>")
			$comment[0].innerTextTEMPFIX = this.comment;
			$comment//.text(this.comment)
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
						// console.log('xx');
						var newComment = this.innerTextTEMPFIX;
						bn.changes.addAndDo({
							net: bn,
							oldComment: bn.comment,
							newComment: newComment,
							exec(comment) {
								this.net.comment = comment;
								$('.sidebar .comment')[0].innerTextTEMPFIX = comment;
							},
							undo() { this.exec(this.oldComment) },
							redo() { this.exec(this.newComment) },
						});
					}
				});
			if (this.comment || force)  this.addBoxToSidebar($comment, {title:'Network Description', class:'commentSec'});
		}
		else {
			this.closeSidebarBox($('.sidebar .comment'));
		}
	},
	/**
		This is still to be fleshed out, in terms of how it will work.
	*/
	apiFind: BN.prototype.find,
	find: function(ref) {
		if (!ref)  return null;
		if (typeof(ref)=="string") {
			return this.apiFind(ref);
		}
		else if (ref.is && ref.is('.parent.item')) {
			return this.getSubmodel(this.currentSubmodel.slice(0,-1));
		}
		else if (ref.attr && ref.attr('id')) {
			var id = ref.attr('id').replace(/^display_/, '');
			return this.apiFind(id);
		}
	},
	addToSelection(items, o = {}) {
		o.toggle = o.toggle || false;
		for (let item of items) {
			item.guiToggleSelect(o.toggle ? {} : {on:true});
		}
	},
	setSelection(items, o = {}) {
		o.add = o.add || o.toggle || false;
		o.toggle = o.toggle || false;
		if (!o.add)  this.clearSelection();
		this.addToSelection(items, o);
	},
	clearSelection() {
		for (var item of this.selected) {
			item.guiToggleSelect({off:true});
		}
	},
	selectAll() {
		for (var node of currentBn.nodes) {
			node.guiToggleSelect({on:true});
		}
	},
	getSelectedArcs() {
		let crossingArcs = new Set();
		let internalArcs = new Set();
		for (let item of this.selected) {
			if (item.pathsIn) {
				for (let path of item.pathsIn) {
					crossingArcs.add(path.arcSelector);
				}
			}
		}
		for (let item of this.selected) {
			if (item.pathsOut) {
				for (let path of item.pathsOut) {
					if (crossingArcs.has(path.arcSelector)) {
						crossingArcs.delete(path.arcSelector);
						internalArcs.add(path.arcSelector);
					}
					else {
						crossingArcs.add(path.arcSelector);
					}
				}
			}
		}
		
		return {internalArcs, crossingArcs};
	},
	/// random name. I should be using proper prototypal inheritance...
	_suhfac_SetEvidence: BN.prototype.setEvidence,
	setEvidence: function(evidence, o = {}, callback = null) {
		o.reset ??= false;
		this._suhfac_SetEvidence(evidence, o);
		
		/// Update GUI
		if (o.reset)  $('.bnview .hasEvidence').removeClass('hasEvidence');
		for (var node in evidence) {
			if (evidence[node]==null)  $(`.bnview #display_${node}`).removeClass('hasEvidence');
			else                       $(`.bnview #display_${node}`).addClass('hasEvidence');
		}
		currentBn.updateAndDisplayBeliefs(null, callback);
		currentBn.notifyEvidenceChanged();
		
		return this;
	},
	clearEvidence(o, callback) {
		this.setEvidence({}, Object.assign({},o,{reset:true}), callback);
	},
	async guiFindAllDConnectedPaths2(sourceNode, destNode, o = {}) {
		let paths = this.findAllDConnectedPaths2(sourceNode, destNode, o);
		let gen = (function*() {
			for (let [i,path] of paths.entries()) {
				currentBn.highlightNodesWithOpacity(path, {asPath:true});
				yield i;
			}
		})();
		if (o.animate) {
			for (let path of gen) {
				await new Promise(r => setTimeout(r, o.animate));
			}
		}
		return gen;
	}
});
/*var apiBN = BN;
BN = function(...args) {
	apiBN.call(this, ...args);
	this.saveListeners = [];
	
	/// Meeting point for any type of listener on this object
	this.listeners = {};
	
	/// Whether to show related nodes when selected a node (and what type of related nodes)
	/// parent|child|etc. and anything supported by |getRelated|
	this.showRelationType = null;

	/// Track changes to the BN
	this.changes = new UndoList();
	this.unsavedChanges = false;
	/// Make this much less hacky (if it's in the prototype, the "addMixin" call will override it)
	this.el = function() { return document.querySelector('.bnview'); }
};
Object.assign(BN, apiBN);
BN.prototype = apiBN.prototype;*/
/*var apiSubmodel = Submodel;
Submodel = function(...args) {
	apiSubmodel.call(this, ...args);
	this.listeners = new Listeners();
	this.listeners.add('update', (msg,extraMsg)=>this.updateView(msg,extraMsg));
};
Object.assign(Submodel, apiSubmodel);
Submodel.prototype = apiSubmodel.prototype;*/
Submodel = class extends Submodel {
	static DisplayItem = addMixin(this, DisplayItem);
	constructor(...args) {
		super(...args);
		this.listeners = new Listeners();
		this.listeners.add('update', (msg,extraMsg)=>this.updateView(msg,extraMsg));
	}
}
Object.assign(Submodel.prototype, {
	update(m, o = {}) {
		o.withPrevious ??= false;
		this.net.changes.addAndDo({
			old: copyTo(this, copyTo(m,{}), {existingOnly:true}),
			new: m,
			withPrevious: o.withPrevious,
			exec: cur => {
				let extraMsg = {};
				if (cur.id && cur.id != this.id) {
					this.rename(cur.id);
				}
				if (cur.submodelPath && cur.submodelPath != this.submodelPath) {
					this.moveToSubmodel(cur.submodelPath);
					extraMsg.submodelPathChanged = true;
				}
				copyTo(cur, this);
				this.listeners.notify('update', cur, extraMsg);
			}
		});
	},
	
	updateView(m, extraMsg = {}) {
		console.log('updateView');
		let el = q(this.el());
		if (m.size?.width!=null) {
			el.style.width = m.size.width+'px';
		}
		if (m.size?.height!=null) {
			el.style.height = m.size.height+'px';
		}
		if (m.id!=null) {
			el.id = 'display_'+this.id;
			el.q('h6').textContent = this.net.headerFormat(m.id, m.label ?? this.label);
		}
		if (m.label!=null) {
			el.q('h6').textContent = this.net.headerFormat(m.id ?? this.id, m.label);
		}
		if (extraMsg.submodelPathChanged!=null) {
			this.guiMoveToSubmodelVisual();
		}
		if (m.format!=null) {
			el.style.set({
					background: m.format.backgroundColor,
					border: m.format.borderColor && m.format.borderColor+' 1px solid',
					color: m.format.fontColor,
					fontFamily: m.format.fontFamily,
					fontSize: m.format.fontSize,
					fontWeight: m.format.bold,
					fontStyle: m.format.italic,
					textAlign: m.format.align,
					padding: m.format.padding,
			}, {null:false});
		}
	},

	displayItem: function(outputEl, $displayItem, force = false) {
		if (this.isHidden() && !force)  return null;
		if (!outputEl && this.net)  outputEl = this.net.outputEl;
		var submodel = this;
		if (!$displayItem) {
			$displayItem = $("<div class='submodel item' id=display_"+submodel.id+">")
				.css({left: submodel.pos.x+"px", top: submodel.pos.y+"px"})
				.css({width: submodel.size.width+"px", height: submodel.size.height+"px"})
				.append(
					$("<h6>").text(submodel.net.headerFormat(submodel.id, submodel.label))
				)
				/// Add back a pointer to the submodel data structure
				.data("submodel", submodel)
				.appendTo(outputEl);
			this._elCached = $displayItem;
			if (submodel.format.borderColor) {
				$displayItem.css('border-color', submodel.format.borderColor);
				$displayItem.find('h6').css('border-color', submodel.format.borderColor);
			}
			if (submodel.format.backgroundColor)  $displayItem.css('background', submodel.format.backgroundColor);
			if (submodel.format.fontColor)  $displayItem.css('color', submodel.format.fontColor);
			if (submodel.format.fontFamily)  $displayItem.css('font-family', submodel.format.fontFamily);
			if (submodel.format.fontSize)  $displayItem.css('font-size', submodel.format.fontSize+'pt');
		}

		return $displayItem;
	},
	contextMenu(event) {
		let menu = new SubmodelContextMenu(this);
		menu.popup({left: event.clientX, top: event.clientY});
	},
	contextMenuOld: function() {
		var node = this;
		let submodel = this;
		let net = this.net;

		var whatsDirty = {};

		/** Options **/
		var $options = $('<div class=options>');
		var menu = Menu({type: "embedded", items: [
			MenuAction("<label>Submodel ID:</label> <input type=text data-control=nodeId class=nodeId value='"+toHtml(node.id)+"' pattern='[a-zA-Z_][a-zA-Z_0-9]*'>", function() { }),
			MenuAction("<label>Label:</label> <input type=text data-control=nodeLabel class=nodeLabel value='"+toHtml(node.label)+"'>", function() { }),
			MenuAction("<label>Submodel:</label> <input type=text data-control=submodelPath class=submodelPath value='"+toHtml(node.getSubmodelPathStr())+"'>", function() { }),
			MenuAction(`
				<label>Dimensions:</label>
				W: <input type=text data-control=width class='width dimension' value='${toHtml(this.size.width)}'>
				H: <input type=text data-control=height class='height dimension' value='${toHtml(this.size.height)}'>
			`, function() { }),
			MenuAction("Delete...", function() {
				submodel.guiDelete({prompt: true});
			}),
		]});
		$options.append(menu.make());
		/** End options **/

		/** Format **/
		var $format = $('<div class=format>');
		var formatMenu = Menu({type: "embedded", items: [
			MenuAction("<label>Background Color:</label> <input type=text data-control=backgroundColor class=backgroundColor value='"+toHtml(submodel.format.backgroundColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("<label>Border Color:</label> <input type=text data-control=borderColor class=borderColor value='"+toHtml(submodel.format.borderColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("<label>Text Color:</label> <input type=text data-control=textColor class=textColor value='"+toHtml(submodel.format.fontColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("<label>Font Family:</label> <input type=text data-control=fontFamily class=fontFamily value='"+toHtml(submodel.format.fontFamily)+"' placeholder='[default]'>", function() { }),
			MenuAction("<label>Font Size:</label> <input type=text data-control=fontSize class=fontSize value='"+toHtml(submodel.format.fontSize)+"' pattern='[0-9]*' placeholder='[default]'>", function() { }),
		]});
		$format.append(formatMenu.make());
		/** End Format **/

		var tabs = new TabSet([
			{id: 'main', label: 'Options', content: $options, active: true},
			{id: 'format', label: 'Format', content: $format},
		]);

		popupEditDialog(tabs.$tabs, {className: 'submodel', controls: {
			width: {change(val) {
				net.changes.addAndDo({
					new: val, old: submodel.size.width,
					exec(current) {
						current = current && current>=0 ? current : '';
						let $displayItem = submodel.el();
						$displayItem.css('width', current);
						submodel.size.width = parseFloat(current);
						currentBn.updateArcs(submodel);
					},
				});
			}},
			height: {change(val) {
				net.changes.addAndDo({
					new: val, old: submodel.size.height,
					exec(current) {
						current = current && current>=0 ? current : '';
						let $displayItem = submodel.el();
						$displayItem.css('height', current);
						submodel.size.height = parseFloat(current);
						currentBn.updateArcs(submodel);
					},
				});
			}},
			backgroundColor: {change: function(val) {
				net.changes.addAndDo({
					new: val, old: submodel.format.backgroundColor,
					exec(current) {
						submodel.el().css('background-color', current);
						submodel.format.backgroundColor = current;
					},
				});
			}},
			borderColor: {change: function(val) {
				net.changes.addAndDo({
					new: val, old: submodel.format.borderColor,
					exec(current) {
						var $displayItem = submodel.el();
						$displayItem.css('border-color', current);
						$displayItem.find('h6').css('border-color', current);
						submodel.format.borderColor = current;
					},
				});
			}},
			textColor: {change: function(val) {
				net.changes.addAndDo({
					new: val, old: submodel.format.fontColor,
					exec(current) {
						submodel.el().css('color', current);
						submodel.format.fontColor = current;
					},
				});
			}},
			fontFamily: {change: function(val) {
				net.changes.addAndDo({
					new: val, old: submodel.format.fontFamily,
					exec(current) {
						current = current ? current : '';
						submodel.el().css('font-family', current);
						submodel.format.fontFamily = current;
					},
				});
			}},
			fontSize: {change: function(val) {
				net.changes.addAndDo({
					new: val, old: submodel.format.fontSize,
					exec(current) {
						submodel.el().css('font-size', current ? current+'pt' : '');
						submodel.format.fontSize = current;
					},
				});
			}},
			submodelPath: {change: function(val) {
				submodel.guiMoveToSubmodel(val);
				/*submodel.setSubmodelPath(val);
				currentBn.display();
				currentBn.displayBeliefs();*/
			}},
			nodeId: {change: function(val) {
				net.changes.addAndDo({
					new: val, old: submodel.id,
					exec(current) {
						var $displayItem = submodel.el();
						$displayItem.attr("id", 'display_'+current);
						submodel.rename(current);
						$displayItem.find('h6').html(submodel.net.headerFormat(submodel.id,submodel.label));
					},
				});
			}},
			nodeLabel: {change: function(val) {
				net.changes.addAndDo({
					new: val, old: submodel.label,
					exec(current) {
						submodel.label = current;
						submodel.el().find('h6').html(submodel.net.headerFormat(submodel.id,submodel.label));
					},
				});
			}},
		}});
	},
	guiAddToNet(net) {
		let submodel = this;
		net.changes.addAndDo({
			submodel: this,
			net: net,
			redo() {
				this.submodel.addToNet(net);
				this.submodel.displayItem(this.net.outputEl);
				this.net.updateArcs(this.submodel);
			},
			undo() {
				/// Just delete the references to the net and other nodes (not this submodel)
				this.submodel.delete({submodel: false});
				let parent = this.net.getSubmodel(this.submodel.submodelPath);
				delete parent.submodelsById[this.submodel.id];
				delete this.net.submodelsById[this.submodel.id];
				this.submodel.el().remove();
				this.submodel.removePaths();
				//this.submodel.cleanPathsInOut();
			},
		});
		return this;
	},
	guiDelete(o = {}) {
		o = {
			prompt: false,
			display: true,
			...o
		};
		
		let doDelete = _=> {
			let items = this.getItems();
			
			this.net.changes.doCombined(_=>{
				
				for (let item of items) {
					item.guiDelete({display: false});
				}
				
				this.net.changes.addAndDo({
					net: this.net, submodel: this, //submodelId: this.id,
					//opts: pick(this, ...'def pos size label comment format submodelPath'.split(/\s+/)),
					redo() {
						//let submodel = this.net.find(this.submodelId);
						/*this.net.changes.chainBefore(_=>{
							submodel.delete({deleteMethod: 'guiDelete'});
						});
						*/
						/// Remove the submodel element, and svg paths
						this.submodel.el().remove();
						this.submodel.removePaths();
						
						/// Remove if selected
						this.submodel.net.selected.delete(this);

						/// Delete base model
						this.submodel.delete({submodel: true});
					},
					undo() {
						//this.net.guiAddSubmodel(this.submodelId, this.opts);
						this.submodel.guiAddToNet(this.net);
					},
				});
			});
		};
		
		//this.net.guiUpdateAndDisplayForLast();
		if (o.prompt) {
			popupDialog($('<div>Are you sure?</div>'), {buttons: [
				$('<button type=button>').html('Delete').on('click', () => {
					let net = this.net;
					doDelete();
					net.guiUpdateAndDisplayForLast();
					dismissDialogs();
				}),
				$('<button type=button>').html('Cancel').on('click', dismissDialogs),
			]});
		}
		else {
			doDelete();
			if (o.display)  this.net.guiUpdateAndDisplayForLast();
		}
	},
});
//var oldNodeInit = Node.prototype.init;
Object.assign(Node.prototype, DisplayItem.prototype, {
	/*init(...args) {
		oldNodeInit.apply(this, args);
		if (this.net)  this.bindUndo(this.net.changes);
	},*/
	updateObject(o, updateId = null) {
		/*let old = {};
		for (let [key,value] of Object.entries(o)) {
			old[key] = this[key];
		}
		console.log(o);*/
		/// This is too expensive! Too much copying.
		let old = {_source: 'node'};
		/// Omit things that can cause cycles
		let toOmit = {parents: true};
		this.copyObject.call(old, this, null, toOmit, o);
		if (o._statesChanges) {
			/// Work out the reverse order
			let reverseOrder = Object.fromEntries(Object.entries(o._statesChanges.order).map(([k,v]) => [v,k]));
			old._statesChanges = {
				deleted: o._statesChanges.added,
				added: o._statesChanges.deleted,
				order: reverseOrder,
			};
		}
		if (o.defType) {
			old.defType = this.def.type;
		}
		if (o._moveParents) {
			/// Work out how to reverse back the order
			let order = o._moveParents.order;
			let reverseOrder = order.slice();
			order.forEach((v,i) => reverseOrder[v] = i);
			old._moveParents = {
				order: reverseOrder,
			};
		}
		let newOb = {_source: 'node'};
		this.copyObject.call(newOb, o, null, toOmit, null, {_statesChanges: true, _moveParents: true, _menuUpdate: true});
		console.log('old and new', old, newOb);
		this.changes().addAndDo({
			old: old,
			new: newOb,
			exec: (o) => {
				this.updateObjectDefault(o, updateId);
			},
		});
	},
	handleObjectUpdate(o, updateId = null) {
		/// Change def type, before doing any copies
		if (o.defType) {
			this.setDefinitionType(o.defType);
		}
		this.copyObject(o, null, {id: true, states: true, defType: true, def: true});
		if (o.id !==undefined || o.label !== undefined) {
			if (o.id !== undefined && o.id !== this.id) {
				console.log('RENAME');
				this.rename(o.id);
			}
			/// The element should really have it's own object link/manager, but I'm
			/// just doing it from here for now
			this._elCached.find('h6').text(this.net.headerFormat(this.id, this.label));
			this._elCached.attr('id', 'display_'+this.id);
		}
		this._elCached[0].classList[o.intervene ? 'add' : 'remove']('intervene');
		if (o.intervene !== undefined) {
			this.def.needsCompile = true;
		}
		if (o.format) {
			let f = o.format;
			console.log(f);
			if (f.backgroundColor)  this._elCached.css('backgroundColor', f.backgroundColor);
			if (f.borderColor)  this._elCached.css('borderColor', f.borderColor);
			if (f.fontColor)  this._elCached.css('color', f.fontColor);
			if (f.fontFamily)  this._elCached.css('fontFamily', f.fontFamily);
			if (f.fontSize)  this._elCached.css('fontSize', f.fontSize+'pt');
			if (f.displayStyle) {
				/// Remove the existing displayStyle class if present
				removeMatchingClasses(this._elCached[0], c => c.startsWith('ds_'));
				this._elCached.attr('data-display-style', null);
				/*let oldDs = this._elCached.attr('data-display-style');
				this._elCached.removeClass('ds_'+oldDs);*/
				/// Add new one, if not default
				if (f.displayStyle != 'default') {
					this._elCached.addClass('ds_'+f.displayStyle).attr('data-display-style', f.displayStyle);
				}
				else {
					if (this.net.nodeDisplayStyle)  this._elCached.addClass('ds_'+this.net.nodeDisplayStyle);
				}
			}
		}
		if (o.states) {
			/// First, update the underlying node
			if (o._statesChanges) {
				if (o._statesChanges.deleted.length) {
					console.log(o._statesChanges.deleted);
					this.removeStates(o._statesChanges.deleted);
				}
				/// Must be run first
				if (o._statesChanges.order && Object.keys(o._statesChanges.order)) {
					/// NYI
					console.log(o._statesChanges.order);
					this.moveStates(o._statesChanges.order);
				}
				if (o._statesChanges.added.length) {
					let ids = o.states.filter((v,i) => o._statesChanges.added.includes(i)).map(s => s.id);
					console.log(ids);
					this.addStates(ids);
				}
				/// Now we can rename the states
				this.renameStates(o.states.map(s => s.id));
				/// And update its other properties
				for (let i=0; i<o.states.length; i++) {
					Object.assign(this.states[i], o.states[i]);
				}
				/// XXX Remove statesChanges from the message
				//delete o.statesChanges;
			}
			let $states = this._elCached.find('.state');
			if (o.states.length < $states.length) {
				for (let i=o.states.length; i<$states.length; i++) {
					$states.eq(i).remove();
				}
				$states = $states.slice(0, o.states.length);
			}
			else if (o.states.length > $states.length) {
				for (let i=$states.length; i<o.states.length; i++) {
					let $state = this._elCached.find('.state:last-child');
					let $newState = $state.clone(true);
					let index = Number($newState.find('.stateName').attr('data-index'))+1;
					$newState.find('.stateName')
						.attr('data-index', index).data('index', index);
					$state.after($newState);
				}
				$states = this._elCached.find('.state');
			}
			for (let [i,state] of o.states.entries()) {
				$states.eq(i).find('.stateName').text(state.label || state.id);
			}
		}
		if (o._moveParents) {
			this.moveParents({order: o._moveParents.order});
		}
		/// Update def after states have been updated
		if (o.def || o.defType) {
			this.copyObject(o, {def:o.def});
			this.def.needsCompile = true;
		}
		/// Update arcs if needed (right now, just update arcs always)
		this.net.redrawArcs(this.el());
	},
	/*moveTo(x, y) {
		console.log('x');
		this.apiMoveTo(x, y);
		this.el().offset({left: this.pos.x, top: this.pos.y});
	},*/
	displayItem: function(outputEl, $displayNode, force = false) {
		if (this.isHidden() && !force)  return null;
		if (!outputEl && this.net)  outputEl = this.net.outputEl;
		var node = this;
		
		if (!$displayNode) {
			$displayNode = $("<div class='node item' id=display_"+node.id+">")
				.css({left: node.pos.x+"px", top: node.pos.y+"px"})
				.append(
					$('<div class=controlBar>').append(
						$("<h6>").text(node.net.headerFormat(node.id, node.label)),
						$(`<div class=hotSpotParent>
							<div class=hotSpotReverse></div>
							<div class=hotSpot></div>
						</div>`)
					)
				)
				.appendTo(outputEl);
			this._elCached = $displayNode;
			if (node.format.borderColor) {
				$displayNode.css('border-color', node.format.borderColor);
				$displayNode.find('.controlBar').css('border-color', node.format.borderColor);
			}
			if (node.format.backgroundColor)  $displayNode.css('background', node.format.backgroundColor);
			if (node.format.fontColor)  $displayNode.css('color', node.format.fontColor);
			if (node.format.fontFamily)  $displayNode.css('font-family', node.format.fontFamily);
			if (node.format.fontSize)  $displayNode.css('font-size', node.format.fontSize+'pt');
			removeMatchingClasses($displayNode[0], c => c.startsWith('ds_'));
			$displayNode.attr('data-display-style', null);
			if (node.format.displayStyle) {
				/// ds_ is the displayStyle namespace
				$displayNode.addClass('ds_'+node.format.displayStyle).attr('data-display-style', node.format.displayStyle);
			}
			else {
				if (node?.net?.nodeDisplayStyle) {
					/// Set class, but not attribute
					$displayNode.addClass('ds_'+node.net.nodeDisplayStyle);
				}
			}
		}
		if (node.dynamic)  $displayNode.addClass("dynamic");
		if (node.net.evidence[node.id]!==undefined)  $displayNode.addClass('hasEvidence');
		$displayNode.addClass(node.type);
		/// Clear out any existing states first
		$displayNode.find(".state").remove();
		$states = $displayNode.append('<div class="states">').find('.states');
		for (var j=0; j<node.states.length; j++) {
			var state = node.states[j];
			$states.append(
				$("<div class=state>").append(
					$("<div class=stateName>").attr("data-index", state.index).text(state.id)
				).append(
					$(`
					<div class=prob></div>
					<div class=beliefBarView>
						<div class=beliefBar data-state-name="${state.id}\n"></div>
					</div>
					`)
				)
			);
		}
		
		/// No longer need to update display, of course
		node._updateDisplay = false;

		return $displayNode;
	},
	displayBeliefs() {
		if (!this.isVisible())  return;

		let $displayNode = this.el();
		let node = this;

		//console.log(node);
		if (node._updateDisplay) {
			node.displayItem(null, $displayNode);
		}
		var stateI = 0;
		var allBeliefs = this.net.getDbnBeliefs(node.id);
		$displayNode.find(".state").each(function() {
			if (node.dynamic) {
				$(this).find(".beliefBarView").html(
					draw.makeProbabilityLine(100, 20, allBeliefs.map(a => a[stateI])).css("border", "solid 1px #ccc")
				);
			}
			else {
				var pc = mbConfig.sigFig(node.beliefs[stateI]);
				var pcCss = node.beliefs[stateI];
				$(this).find(".prob").text(String(pc).replace(/^0\./, '.'));
				$(this).find(".beliefBar").css({width:(pcCss*100)+'%'});
				$(this).find('.beliefBar')[0].dataset.stateName = node.states[stateI].id+'\n'+String(pc).replace(/^0\./, '.');
			}
			stateI++;
		});
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
	_prepTable2: function(type) {
		var node = this;
		var table = document.createElement('table');
		table.className = type;
		var npc = node.numParentCombinations();
		var parentIndexes = setupIndexes(node.parents);
		/// Write out header
		var header = document.createElement('tr');
		for (let i=0; i<node.parents.length; i++) {
			let parent = node.parents[i];
			let th = document.createElement('th');
			th.textContent = parent.id;
			header.appendChild( th );
		}
		table.appendChild(header);
		/// Write out each row
		for (var i=0; i<npc; i++) {
			var tr = document.createElement('tr');
			for (let k=0; k<node.parents.length; k++) {
				let parent = node.parents[k];
				//tr.appendChild( n('th', parent.states[parentIndexes[k]].id) );
				let th = document.createElement('th');
				th.textContent = parent.states[parentIndexes[k]].id;
				tr.appendChild(th);
			}
			table.appendChild(tr);
			nextCombination(node.parents, parentIndexes);
		}
		return table;
	},
	makeCptHtml: function(cptOnly) {
		var node = this;
		
		function addStateHeader(tr, id) {
			let th = document.createElement('th');
			th.className = 'stateLabel';
			let span = document.createElement('span');
			span.className = 'stateId';
			span.setAttribute('data-control', 'state');
			span.setAttribute('contenteditable', 'true');
			span.textContent = id;
			th.appendChild(span);
			tr.appendChild(th);
			/*$tr.append('<th class=stateLabel><span class=stateId data-control=state contenteditable>'+toHtml(id)+'</span></th>');*/
		}

		function addStateEntry(tr, prob) {
			let td = document.createElement('td');
			let span = document.createElement('span');
			span.className = 'prob';
			span.setAttribute('data-control', 'cpt');
			span.setAttribute('contenteditable', 'true');
			span.textContent = toChance(sigFig(prob,3));
			td.appendChild(span);
			tr.appendChild(td);
			/*var td = n('td',
				n('span.prob', {contenteditable:'true', 'data-control': 'cpt'}, toChance(sigFig(prob,3)))
			);
			tr.appendChild(td);*/
			draw.setProbBackground($(td));
		}

		function addStateColumn(id) {
			addStateHeader($('.dialog .def .stateId:first').closest('tr')[0], id);
			$('.dialog .def td:last-child .prob').each(function() {
				addStateEntry($(this).closest('tr')[0], 0);
			});
		}

		function removeStateColumn(stateNum) {
			var cellI = $('.dialog .def .stateId').eq(stateNum).closest('th')[0].cellIndex;
			$('.dialog .def tr th:nth-child('+(cellI+1)+'), .dialog .def tr td:nth-child('+(cellI+1)+')').remove();
		}

		/*let startTime = performance.now();
		for (let i=0; i<100; i++) {
			node._prepTable2("cpt");
		}
		console.log(performance.now() - startTime);

		startTime = performance.now();
		for (let i=0; i<100; i++) {
			node._prepTable("cpt");
		}
		console.log(performance.now() - startTime);*/

		/// Setup the table DOM
		var table = node._prepTable2("cpt");
		var tr = table.querySelector('tr');
		/// Track last cpt entry that had the focus
		var probFocused = null;
		for (var j=0; j<node.states.length; j++) {
			addStateHeader(tr, node.states[j].id);
		}
		for (var i=0; i<table.rows.length-1; i++) {
			var row = node.def.getRow(i);
			var tr = table.rows[i+1];
			/// Now list the distro for each row
			for (var j=0; j<row.length; j++) {
				addStateEntry(tr, row[j]);
			}
		}
		var $table = $(table);
		/*var $tr = $table.find("tr:eq(0)");
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
		}*/

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
				}).on('keydown', 'th span', function(event) {
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
			values = node.values;
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
		var possTypes = ['nature','decision','utility'];
		var possTypeLabels = ['Nature','Decision','Utility'];
		for (var i=0; i<possTypes.length; i++) {
			options.push($("<option>").val(possTypes[i]).text(possTypeLabels[i]));
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
			MenuAction("Delete...", function() { node.guiDelete({prompt:true}); }),
			MenuAction("<div class=commentSec><label>Comment:</label><textarea class=comment data-control=comment>"+toHtml(node.comment)+"</textarea></div>", function(){}),
		]});
		return $(menu.make())
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
		var $def = $("<div class=def>").addClass('def'+node.def.type);
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

		return [$defType, $def];
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
		var nodeDup = node.duplicate();
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
		tabs.$tabs.on('keydown', '*[data-control=cpt]', function(event) {
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
		}).on('change, input', '*[data-control=nodeType]', function(event) {
			/// Create a duplicate from the *original* node, and then
			/// copy the relevant pieces into nodeDup
			//let tempDup = node.duplicate();
			let prevType = nodeDup.type;
			if (prevType == 'utility') {
				nodeDup.setType(node.type);
				nodeDup.def = node.def.duplicate();
				nodeDup.setStates(node.states.map(s => s.id));
				nodeDup.setType($(this).val());
			}
			else {
				nodeDup.setType($(this).val());
			}
		}).on('paste', '*[data-control=cpt]', function(event) {
			console.log('PASTE');
			event.preventDefault();
			let data = event.originalEvent.clipboardData.getData('text/plain');
			let lines = data.split(/\n/);
			let td = $(this).closest('td')[0];
			let tr = $(td).closest('tr')[0];
			let table = $(td).closest('table')[0];
			for (let [i,line] of lines.entries()) {
				let vals = line.split(/\s+/);
				let curTr = table.rows[tr.rowIndex + i];
				if (curTr)  for (let [j,val] of vals.entries()) {
					if (val) {
						let curTd = curTr.cells[td.cellIndex + j];
						if (curTd) {
							$(curTd).find('span').text( val ).trigger('change');
						}
					}
				}
			}
		}).on('mousedown', '.cpt td, .cpt th', function(event) {
			let $startCell = $(event.target).closest('td, th');
			let $table = $startCell.closest('table');
			$startCell.closest('table').find('.selected').removeClass('selected');
			$(document).on('mousemove.cellSelect', function(event) {
				$startCell.closest('table').find('.selected').removeClass('selected');
				event.preventDefault();
				let $endCell = $(event.target).closest('td, th');
				let [startCellI, endCellI] = [$startCell.index(), $endCell.index()].sort();
				let [startRowI, endRowI] = [$startCell.closest('tr').index(), $endCell.closest('tr').index()].sort();
				console.log({startCellI, endCellI, startRowI, endRowI});
				for (let r=startRowI; r<=endRowI; r++) {
					for (let c=startCellI; c<=endCellI; c++) {
						$($table[0].rows[r].cells[c]).addClass('selected');
					}
				}
			}).on('mouseup.cellSelect', function() {
				$(document).off('.cellSelect .cellCopy');
				$(document).on('copy.cellCopy', function(event) {
					console.log('xxx');
					let str = "";
					let lastRow = -1;
					let firstCell = true;
					$('.cpt .selected').each(function() {
						let thisRow = $(this).closest('tr').index();
						if (thisRow > lastRow) {
							str += str ? '\n' : '';
							lastRow = thisRow;
							firstCell = true;
						}
						str += (!firstCell ? '\t' : '') + $(this).text();
						firstCell = false;
					});
					event.originalEvent.clipboardData.setData('text/plain', str);
					event.originalEvent.preventDefault();
				});
			});
		})

		node.net.changes.startCombined();
		let net = node.net;
		popupEditDialog(tabs.$tabs, {className: 'node',
			onsave: function() {
				/// Update the duplicate node
				node.duplicateInto(nodeDup);
				//node.net.changes.endCombined();
			},
			onclose: function() {
				//node.net.changes.endCombined();
			},
			ondestroy() {
				console.log('destroyed');
				net.changes.endCombined();
				$(document).off('.cellCopy');
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
					node.guiMoveToSubmodel(val);
					/*node.net.changes.addAndDo({
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
					});*/
				}},
				nodeId: {change: function(val) {
					node.net.changes.addAndDo({
						net: node.net,
						oldId: node.id,
						newId: val,
						rename(toId, prevId) {
							let node = this.net.find(prevId);
							console.log('renaming', $('#display_'+node.id), toId);
							var $displayNode = $('#display_'+node.id);
							$displayNode.attr("id", 'display_'+toId);
							node.rename(toId);
							$displayNode.find('h6').html(currentBn.headerFormat(node.id,node.label));
						},
						undo() {
							this.rename(this.oldId, this.newId);
						},
						redo() {
							this.rename(this.newId, this.oldId);
						}
					});
				}},
				nodeLabel: {change: function(val) {
					node.net.changes.addAndDo({
						net: node.net, node: node,
						old: node.label,
						new: val,
						exec(current) {
							//let node = this.net.find(this.nodeId);
							//var $displayNode = $('#display_'+node.id);
							let $displayNode = this.node.el();
							this.node.label = current;
							$displayNode.find('h6').html(currentBn.headerFormat(this.node.id,this.node.label));
						},
						/*undo() {
							this.relabel(this.oldLabel);
						},
						redo() {
							this.relabel(this.newLabel);
						}*/
					});
				}},
				nodeType: {change: function(val) {
					node.net.changes.addAndDo({
						net: node.net, nodeId: node.id,
						old: {type: node.type, def: node.def.duplicate(), states: node.states.map(s => s.id),
								children: node.children.map(c => [c.id,c.def.duplicate()])},
						new: {type: val, def: null},
						exec(current, previous) {
							let node = this.net.find(this.nodeId);
							node.setType(current.type);
							if (current.def)  node.def = current.def;
							else  current.def = node.def;
							if (previous.type=='utility') {
								node.setStates(current.states);
								current.children.forEach(([cid,cdef]) => {
									let child = node.net.find(cid);
									node.addChildren([child]);
									child.def = cdef.duplicate();
								});
							}
							currentBn.display();
							currentBn.updateAndDisplayBeliefs();
						},
					});
				}},
				definitionType: {change: function(val) {
					node.net.changes.addAndDo({
						net: node.net, nodeId: node.id,
						old: {type: node.def.type, def: node.def.duplicate()},
						new: {type: val, def: null},
						exec(current, previous) {
							let node = this.net.find(this.nodeId);
							node.setDefinitionType(current.type);
							if (current.def)  node.def = current.def;
							else  current.def = node.def;
							currentBn.display();
							currentBn.updateAndDisplayBeliefs();
						},
					});
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
						net: node.net, node: node,
						old: node.comment,
						new: $(".dialog textarea.comment").val(),
						exec(current) {
							this.node.comment = current==null ? '' : current;
						},
					});
				}},
				cpt: {change: function(val) {
					var oldNode = node.duplicate();
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
								var oldChildren = [];
								var node = this.net.nodesById[this.nodeId];
								if (node.states.length != toStates.length) {
									for (var child of node.children) {
										oldChildren.push( child.duplicateLocal() );
									}
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
									for (var [i,child] of Object.entries(node.children)) {
										child.def.updateChild({oldChild: oldChildren[i]});
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
					let newTable = $(".dialog .state")
						.map(function() { return $(this).is('select') ? $(this).val() : $(this).text(); })
						.get();
					node.net.changes.addAndDo({
						name: 'Change CDT',
						net: node.net, nodeId: node.id,
						old: node.def.funcTable.slice(),
						new: newTable,
						exec(current) {
							let node = this.net.find(this.nodeId);
							console.log(this.nodeId, current, node.type);
							if (node.type == "utility") {
								node.setValues(current.map(v => parseFloat(v)));
							}
							else {
								node.def.set(current.map(v => parseInt(v)));
							}
							currentBn.display();
							currentBn.updateAndDisplayBeliefs();
						},
					});
				}},
				state: {change: function() {
					node.net.changes.addAndDo({
						name: 'Rename states',
						old: node.states.map(s => s.id),
						new: $(".dialog .stateLabel").map(function() { return $(this).text(); }).toArray(),
						exec(states) {
							/// XXX Validate the rename
							var o = {};
							for (var i=0; i<states.length; i++)  o[i] = states[i].trim();
							console.log(o);
							node.renameStates(o);
							currentBn.display();
							currentBn.displayBeliefs();
						}
					});
				}},
			}
		});
	},
	contextMenu(event) {
		/// The new node dialog box/context menu
		/// To do:
		/// Changes in the net must propagate to the box
		///   - If some part of the box was changed, it gets overwritten
		/// Changes in the box must propagate to the net only after clicking 'Save'
		/// Dialogs are non-modal, can be moved around, resized (and are potentially dockable)
		console.log('menu');
		let menu = new NodeContextMenu(this);
		menu.popup({left: event.clientX, top: event.clientY});
		return menu;
	},
	guiAddToNet(net) {
		let node = this;
		//return net.guiAddNode(this.id, this.states.map(s=>s.id), this);
		net.changes.addAndDo({
			node: this,
			net: net,
			redo() {
				this.node.addToNet(net);
				this.node.displayItem(this.net.outputEl);
				this.net.updateArcs(this.node);
			},
			undo() {
				this.node.delete();
				this.node.el().remove();
				this.node.removePaths();
				//this.node.cleanPathsInOut();
			},
		});
		return this;
	},
	guiDelete: function(o = {}) {
		o = {
			prompt: false,
			display: true,
			...o
		};

		/// I think I should remove nodeOrig eventually?
		let node = this.nodeOrig ? this.nodeOrig : this;
		let net = node.net;
			
		let doDelete = _=> {
			net.changes.addAndDo({
				net: net, node: node,
				childDefs: node.children.map(c => c.def.duplicate()),
				/*net: net, nodeId: node.id,
				childDefs: node.children.map(c => c.def.duplicate()),
				states: node.states.map(s => s.id),
				opts: {...pick(node, ...'def pos size label type comment format submodelPath values'.split(/\s+/)),
						...{parents: BN.getIds(node.parents), children: BN.getIds(node.children)}},*/
				redo() {
					console.log('START REDO DELETE');
					//let node = this.net.find(this.nodeId);

					/// Remove objects for node and arcs (and probably more in future)
					this.node.el().remove();
					this.node.removePaths();
					//this.net.outputEl.find('#display_'+node.id).remove();
					// for (let p of node.pathsIn)  this.net.outputEl.find('#'+p.pathId).data('arcSelector').removePath();
					// for (let p of node.pathsOut)  this.net.outputEl.find('#'+p.pathId).data('arcSelector').removePath();
					this.node.pathsIn.length = 0;
					this.node.pathsOut.length = 0;
					
					/// Remove from selections if there
					this.node.net.selected.delete(this);

					/// Delete base object
					this.node.delete();
					console.log('END REDO DELETE');
				},
				undo() {
					console.log('START UNDO DELETE');
					/// Hmmm, not sure whether addNode should take ownership of the arrays passed into opts
					/// or not.
					//let node = this.net.guiAddNode(this.nodeId, this.states, this.opts);
					this.node.guiAddToNet(this.net);
					/// Restore child definitions
					for (let [i,child] of Object.entries(this.node.children)) {
						child.def = this.childDefs[i].duplicate();
					}
					this.net.updateArcs(this.node);
					console.log('END UNDO DELETE');
				},
			});
		}
		
		if (o.prompt) {
			popupDialog($('<div>Are you sure?</div>'), {buttons: [
				$('<button type=button>').html('Delete').on('click', () => {
					doDelete();
					net.guiUpdateAndDisplayForLast();
					dismissDialogs();
				}),
				$('<button type=button>').html('Cancel').on('click', dismissDialogs),
			]});
		}
		else {
			doDelete();
			if (o.display)  net.guiUpdateAndDisplayForLast();
		}
	},
	guiAddParents(parents) {
		this.changes().addAndDo({
			parents: parents.slice(),
			net: this.net, node: this,
			name: "Add Parents",
			redo() {
				this.node.addParents(this.parents);
				this.net.updateArcs(this.node.getVisibleItem());
				this.net.notifyStructureChanged();
			},
			undo() {
				this.node.removeParents(this.parents);
				this.net.updateArcs(this.node.getVisibleItem());
				this.net.notifyStructureChanged();
			},
		});
	},
	guiAddChildren(children) {
		this.changes().addAndDo({
			children: children.slice(),
			net: this.net, node: this,
			name: "Add Children",
			redo() {
				this.node.addChildren(this.children);
				this.net.updateArcs(this.node.getVisibleItem());
				this.net.notifyStructureChanged();
			},
			undo() {
				this.node.removeChildren(this.children);
				this.net.updateArcs(this.node.getVisibleItem());
				this.net.notifyStructureChanged();
			},
		});
	},
	guiRemoveParents(parents) {
		this.changes().addAndDo({
			parents: parents.slice(),
			childDef: this.def.duplicate(),
			net: this.net, node: this,
			name: "Remove Parents",
			redo() {
				this.node.removeParents(this.parents);
				this.net.updateArcs(this.node);
				this.net.notifyStructureChanged();
			},
			undo() {
				this.node.addParents(this.parents);
				this.node.def = this.childDef.duplicate();
				this.net.updateArcs(this.node);
				this.net.notifyStructureChanged();
			},
		});
	},
	guiRemoveChildren(children) {
		this.changes().addAndDo({
			children: children.slice(),
			childDefs: this.children.map(c => c.def.duplicate()),
			net: this.net, node: this,
			name: "Remove Parents",
			redo() {
				this.node.removeChildren(this.children);
				this.net.updateArcs(this.node);
				this.net.notifyStructureChanged();
			},
			undo() {
				this.node.addChildren(this.children);
				for (let [child,childDef] of zip(this.children,this.childDefs)) {
					child.def = childDef.duplicate();
				}
				this.net.updateArcs(this.node);
				this.net.notifyStructureChanged();
			},
		});
	},
	/*guiDelete: function() {
		var node = this.nodeOrig ? this.nodeOrig : this;
		/// FIX: Once have undo/redo, remove the prompt
		popupDialog($('<div>Are you sure?</div>'), {buttons: [
			$('<button type=button>').html('Delete').on('click', function() {
				node.apiDelete();

				/// Remove objects for node and arcs (and probably more in future)
				node.net.outputEl.find('#display_'+node.id).remove();
				for (var p of node.pathsIn)  node.net.outputEl.find('#'+p.pathId).remove();
				for (var p of node.pathsOut)  node.net.outputEl.find('#'+p.pathId).remove();

				 app.updateBN();
				 dismissDialogs();
			}),
			$('<button type=button>').html('Cancel').on('click', dismissDialogs),
		]});
	},*/
	isAlwaysHidden: function() {
		return this.engineOnly;
	},
	lightNodeEdit() {
		let bn = this.net;
		let node = this;
		let headerEl = this.el().find('h6');
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
			bn.clearSelection();
			node.guiToggleSelect(true);
			var $node = $(headerEl).closest('.node');
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
				
				/// This will get triggered *within* the click event, so scheduling it
				/// so that it gets added after the current event is complete. (I think
				/// dynamic events are preferable to having the events constantly active.)
				/// ** And, I have to use mousedown, not click, because dragging out a new node
				/// will act like a click event, with the target being where mouseup occurs
				/// (I'm not so sure why)
				/// All of this needs fixing!
				setTimeout(_=> {
					$(document).on('mousedown.nodeEdit', function(event) {
						var $t = $(event.target);
						console.log($t.closest($node), $t, $node, event);
						/// If clicking inside node (but not hotspots), don't clear
						if (!$t.closest('.hotSpot,.hotSpotReverse').length && $t.closest($node).length) {
							return;
						}

						/// If clicking outside node, save and end edit session
						console.log('x');
						endEdit();
						if ($currentField)  updateField($currentField);
					});
				}, 0);
				$(document).on('keydown.nodeEdit', function(event) {
					console.log('xy');
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
				}).on('input.nodeEdit', 'h6, .stateName', function() {
					node.net.redrawArcs($node);
				}).on('focus.nodeEdit', 'h6, .stateName', function() {
					console.log('ff');
					$currentField = $(this);
					selectContents(this);
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
					/*Delete:
					node.net.changes.addAndDo({
						net: node.net,
						oldId: node.id,
						oldLabel: node.label,
						newId: makeValidId($el.text()),
						newLabel: $el.text(),
						rename(oldId, toId, toLabel) {
							let node = this.net.find(oldId);
							let $displayNode = $('#display_'+oldId);
							$displayNode.attr("id", 'display_'+toId);
							node.label = toLabel;
							node.rename(toId);
							$displayNode.find('h6').html(currentBn.headerFormat(node.id,node.label));
						},
						undo() { this.rename(this.newId, this.oldId, this.oldLabel); },
						redo() { this.rename(this.oldId, this.newId, this.newLabel); }
					});*/
					let label = $el.text();
					let id = undefined;
					/// If node has a placeholder id (in the form node\d+), overwrite with new id based on label
					if (node.id.search(/^node\d+$/)!=-1) {
						id = makeValidId(label);
						label = label;
					}
					/// If the node has no existing label, and the new label is a valid id,
					///	use label as id and don't do a label
					else if (!node.label && label == makeValidId(label)) {
						id = label;
						label = undefined;
					}
					/// If node has an id which is an made-valid transformation of its label, make an id from the new label
					else if (node.id == makeValidId(node.label)) {
						id = makeValidId(label);
					}
					node.updateObject({label, id});
				}
				else if ($el.is('.stateName')) {
					var stateI = $el.attr('data-index');
					var oldStateId = node.states[$el.attr('data-index')].id;
					var $displayNode = $('#display_'+node.id);
					var $stateId = $displayNode.find(`.stateName[data-index=${stateI}]`);
					var newStateId = $stateId.text();
					//onsole.trace();
					console.log('doing rename', el, $el.data('index'), $el.attr('data-index'), stateI, oldStateId, newStateId, $stateId, $displayNode);
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

			startEdit(headerEl);

			return false;
		}
		lightNodeEdit();
	},
});
Node.handleEvents = function(bnComponent) {
	$(bnComponent).on('contextmenu', '.node.item', event => {
		let bn = $(bnComponent).data('bn');
		if (!event.ctrlKey) {
			let item = bn.getItem(event.currentTarget);
			bn.clearSelection();
			item.guiToggleSelect(true);
			//event.stopImmediatePropagation();
			event.preventDefault();
			item.contextMenu(event);
		}
	});

	/// Switch to triggering *only* on header double-click
	//$(".bnview").on("dblclick", ".node h6, .node .stateName", lightNodeEdit);
	$(bnComponent).on("dblclick", ".node h6", event=>currentBn.findItem(event.target).lightNodeEdit());
	$(document).on("keyup", event=> {
		//onsole.log(event);
		if (event.key == 'F2' && currentBn.selected.size >= 1) {
			[...currentBn.selected][0].lightNodeEdit()
		}
	});
};

TextBox = class extends TextBox {
	static DisplayItem = addMixin(this, DisplayItem);
	constructor(...args) {
		super(...args);
		this.listeners = new Listeners();
		this.listeners.add('update', msg=>this.updateView(msg));
	}
};
Object.assign(TextBox.prototype, {
	update(m, o = {}) {
		o.withPrevious ??= false;
		this.net.changes.addAndDo({
			old: copyTo(this, copyTo(m,{}), {existingOnly:true}),
			new: m,
			withPrevious: o.withPrevious,
			exec: cur => {
				copyTo(cur, this);
				this.listeners.notify('update', cur);
			}
		});
	},
	
	updateView(m) {
		console.log('updateView');
		let el = q(this.el());
		if (m.text!=null) {
			el.innerTextTEMPFIX = m.text;
		}
		if (m.size?.width!=null) {
			el.style.width = m.size.width+'px';
		}
		if (m.size?.height!=null) {
			el.style.height = m.size.height+'px';
		}
		if (m.id!=null) {
			el.id = 'display_'+this.id;
		}
		if (m.format!=null) {
			el.style.set({
					background: m.format.backgroundColor,
					border: m.format.borderColor && m.format.borderColor+' 1px solid',
					color: m.format.fontColor,
					fontFamily: m.format.fontFamily,
					fontSize: m.format.fontSize,
					fontWeight: m.format.bold,
					fontStyle: m.format.italic,
					textAlign: m.format.align,
					padding: m.format.padding,
			}, {null:false});
		}
	},
	
	/// Like make()
	displayItem: function(outputEl, $displayNode, force = false) {
		if (this.isHidden() && !force)  return null;
		if (!outputEl && this.net)  outputEl = this.net.outputEl;
		var textBox = this;
		if (!$displayNode) {
			$displayNode = $("<div class='textBox item' id=display_"+textBox.id+">")
				.css({left: textBox.pos.x+"px", top: textBox.pos.y+"px"})
				.css({
					width: textBox.size.width==-1 ? null : (textBox.size.width+"px"),
					height: textBox.size.height==-1 ? null : (textBox.size.height+"px")
				})
				.appendTo(outputEl);
			this._elCached = $displayNode;
			this.updateView(this);
		}
		if (textBox.type)  $displayNode.addClass(textBox.type);

		return $displayNode;
	},
	guiAddToNet(net) {
		let textBox = this;
		net.changes.addAndDo({
			textBox: this,
			net: net,
			redo() {
				this.textBox.addToNet(net);
				this.textBox.displayItem(this.net.outputEl);
			},
			undo() {
				this.textBox.delete();
				textBox.el().remove();
			},
		});
		return this;
	},
	guiDelete(o = {}) {
		o = {
			prompt: false,
			...o
		};

		let doDelete = _=> {
			this.net.changes.addAndDo({
				net: this.net,
				textBox: this,
				redo() {
					/// Remove gui components
					this.textBox.el().remove();
					
					/// Remove from selection if there
					this.textBox.net.selected.delete(this);
					
					/// Delete base object
					this.textBox.delete();
				},
				undo() {
					this.net.addTextBox(this.textBox);
					this.textBox.displayItem(this.net.outputEl);
				},
			});
		};

		if (o.prompt) {
			popupDialog($('<div>Are you sure?</div>'), {buttons: [
				$('<button type=button>').html('Delete').on('click', () => {
					let net = this.net;
					doDelete();
					dismissDialogs();
				}),
				$('<button type=button>').html('Cancel').on('click', dismissDialogs),
			]});
		}
		else {
			doDelete();
		}		
	},
	guiEdit(o = {}) {
		o.combine ??= false;
		
		let te = this;
		let closeOut = _=> {
			let el = q(this.el());
			let newHeight = el.scrollHeight;
			el
				.removeAttribute('contenteditable')
				.classList.remove('editMode').root;
			window.getSelection().removeAllRanges();
			var newText = el.innerTextTEMPFIX;

			evts.remove();

			te.update({text:newText, size:{height:newHeight}}, {withPrevious:o.combine});
		}
		
		q(this.el())
			.setAttribute("contenteditable", "")
			.classList.add('editMode').root
			.focus();
		document.execCommand('selectAll', false, null);
		
		let evts = new ListenerGroup();
		setTimeout(_=> {
			evts.add(document, 'click', event => {
				if (event.target.closest('.textBox')!=this.el()[0]) {
					closeOut.apply(this.el()[0]);
				}
			});
			evts.add(this.el(), 'focusout', closeOut);
		}, 100);
	},
	contextMenu(event) {
		let menu = new TextContextMenu(this);
		menu.popup({left: event.clientX, top: event.clientY});
	},
	contextMenuOld() {
		let textBox = this;
		let net = this.net;

		var whatsDirty = {};

		/** Options **/
		var $options = $('<div class=options>');
		var menu = Menu({type: "embedded", items: [
			MenuAction("<label>TextBox ID:</label> <input type=text data-control=textBoxId class=textBoxId value='"+toHtml(this.id)+"' pattern='[a-zA-Z_][a-zA-Z_0-9]*'>", function() { }),
			MenuAction("<label>Submodel:</label> <input type=text data-control=submodelPath class=submodelPath value='"+toHtml(this.getSubmodelPathStr())+"'>", function() { }),
			MenuAction(`
				<label>Dimensions:</label>
				W: <input type=text data-control=width class='width dimension' value='${toHtml(this.size.width)}'>
				H: <input type=text data-control=height class='height dimension' value='${toHtml(this.size.height)}'>
				`, function() { }),
			MenuAction("Delete...", function() {
				textBox.guiDelete({prompt: true});
			}),
		]});
		$options.append(menu.make());
		/** End options **/

		/** Format **/
		var $format = $('<div class=format>');
		var formatMenu = Menu({type: "embedded", items: [
			//MenuAction("<label>Background Color:</label> <input type=text data-control=backgroundColor class=backgroundColor value='"+toHtml(textBox.format.backgroundColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			//MenuAction("<label>Border Color:</label> <input type=text data-control=borderColor class=borderColor value='"+toHtml(textBox.format.borderColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("<label>Text Color:</label> <input type=text data-control=textColor class=textColor value='"+toHtml(textBox.format.fontColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("<label>Font Family:</label> <input type=text data-control=fontFamily class=fontFamily value='"+toHtml(textBox.format.fontFamily)+"' placeholder='[default]'>", function() { }),
			MenuAction("<label>Font Size:</label> <input type=text data-control=fontSize class=fontSize value='"+toHtml(textBox.format.fontSize)+"' pattern='[0-9]*' placeholder='[default]'>", function() { }),
		]});
		$format.append(formatMenu.make());
		/** End Format **/

		var tabs = new TabSet([
			{id: 'main', label: 'Options', content: $options, active: true},
			{id: 'format', label: 'Format', content: $format},
		]);

		net.changes.startCombined();
		popupEditDialog(tabs.$tabs, {className: 'node', 
			ondestroy() {
				console.log("DESTROYED");
				net.changes.endCombined();
			},
			controls: {
				width: {change(val) {
					net.changes.addAndDo({
						new: val, old: textBox.size.width,
						exec(current) {
							current = current && current>=0 ? current : '';
							let $displayNode = textBox.el();
							$displayNode.css('width', current);
							textBox.size.width = parseFloat(current);
						},
					});
				}},
				height: {change(val) {
					net.changes.addAndDo({
						new: val, old: textBox.size.height,
						exec(current) {
							current = current && current>=0 ? current : '';
							let $displayNode = textBox.el();
							$displayNode.css('height', current);
							textBox.size.height = parseFloat(current);
						},
					});
				}},
				backgroundColor: {change: function(val) {
					net.changes.addAndDo({
						new: val, old: textBox.format.backgroundColor,
						exec(current) {
							if (!current)  current = '';
							var $displayNode = textBox.el();
							$displayNode.css('background-color', current);
							textBox.format.backgroundColor = current;
						},
					});
				}},
				borderColor: {change: function(val) {
					/*var $displayNode = $('#display_'+node.id);
					$displayNode.css('border-color', val);
					$displayNode.find('h6').css('border-color', val);
					node.format.borderColor = val;*/
				}},
				textColor: {change: function(val) {
					net.changes.addAndDo({
						new: val, old: textBox.format.fontColor,
						exec(current) {
							if (!current)  current = '';
							var $displayNode = textBox.el();
							$displayNode.css('color', current);
							textBox.format.fontColor = current;
						},
					});
				}},
				fontFamily: {change: function(val) {
					net.changes.addAndDo({
						new: val, old: textBox.format.fontFamily,
						exec(current) {
							if (!current)  current = '';
							var $displayNode = textBox.el();
							$displayNode.css('font-family', current);
							textBox.format.fontFamily = current;
						},
					});
				}},
				fontSize: {change: function(val) {
					net.changes.addAndDo({
						new: val, old: textBox.format.fontSize,
						exec(current) {
							if (!current)  current = '';
							var $displayNode = textBox.el();
							$displayNode.css('font-size', current ? current+'pt' : '');
							textBox.format.fontSize = parseFloat(current);
						},
					});
				}},
				submodelPath: {change: function(val) {
					net.changes.addAndDo({
						new: val, old: textBox.getSubmodelPathStr(),
						exec(current) {
							textBox.setSubmodelPath(current);
							textBox.net.display();
							textBox.net.displayBeliefs();
						},
					});
				}},
				textBoxId: {change: function(val) {
					net.changes.addAndDo({
						new: val, old: textBox.id,
						exec(current) {
							let $displayNode = textBox.el();
							$displayNode.attr("id", 'display_'+current);
							textBox.rename(current);
							$displayNode.find('h6').html(currentBn.headerFormat(textBox.id,textBox.label));
							/*var $displayNode = $('#display_'+textBox.id);
							$displayNode.attr("id", 'display_'+val);
							textBox.rename(val);
							$displayNode.find('h6').html(currentBn.headerFormat(textBox.id,textBox.label));*/
						},
					});
				}},
			}
		});
	},
});
TextBox.handleEvents = function(bnComponent) {
	$(bnComponent).on('contextmenu', '.textBox.item', event => {
		let bn = $(bnComponent).data('bn');
		if (!event.ctrlKey) {
			let item = bn.getItem(event.currentTarget);
			bn.clearSelection();
			item.guiToggleSelect(true);
			event.stopImmediatePropagation();
			event.preventDefault();
			item.contextMenu(event);
		}
	});
};

ImageBox.prototype = Object.assign(ImageBox.prototype, {
	displayItem: function(outputEl, $displayNode, force = false) {
		if (this.isHidden() && !force)  return null;
		if (!outputEl && this.net)  outputEl = this.net.outputEl;
		var imageBox = this;
		if (!$displayNode) {
			$displayNode = $("<img class='imageBox item' id=display_"+imageBox.id+">")
				.css({left: imageBox.pos.x+"px", top: imageBox.pos.y+"px"})
				.css({
					width: imageBox.size.width==-1 ? null : (imageBox.size.width+"px"),
					height: imageBox.size.height==-1 ? null : (imageBox.size.height+"px")
				})
				/*.append(
					node.net.headerFormat(toHtml(node.text).replace(/\\n/g, '<br>'))
				)*/
				.appendTo(outputEl);
			this._elCached = $displayNode;
			
			$displayNode.attr('src', imageBox.imageUrl);
			//$displayNode[0].innerText = imageBox.text;
			
			if (imageBox.format) {
				if (imageBox.format.borderColor) {
					$displayNode.css('border-color', imageBox.format.borderColor);
					$displayNode.find('h6').css('border-color', imageBox.format.borderColor);
				}
				if (imageBox.format.backgroundColor)  $displayNode.css('background', imageBox.format.backgroundColor);
				if (imageBox.format.fontColor)  $displayNode.css('color', imageBox.format.fontColor);
				if (imageBox.format.fontFamily)  $displayNode.css('font-family', imageBox.format.fontFamily);
				if (imageBox.format.fontSize)  $displayNode.css('font-size', imageBox.format.fontSize+'pt');
				if (imageBox.format.bold)  $displayNode.css('font-weight', 'bold');
				if (imageBox.format.italic)  $displayNode.css('font-style', 'italic');
				if (imageBox.format.align)  $displayNode.css('text-align', imageBox.format.align);
			}
		}
		if (imageBox.type)  $displayNode.addClass(imageBox.type);

		return $displayNode;
	},
	guiAddToNet(net) {
		let imageBox = this;
		net.changes.addAndDo({
			imageBox: this,
			net: net,
			redo() {
				this.imageBox.addToNet(net);
				this.imageBox.displayItem(this.net.outputEl);
			},
			undo() {
				this.imageBox.delete();
				imageBox.el().remove();
			},
		});
		return this;
	},
	guiDelete(o = {}) {
		o = {
			prompt: false,
			...o
		};

		let doDelete = _=> {
			this.net.changes.addAndDo({
				net: this.net,
				imageBox: this,
				redo() {
					/// Remove gui components
					this.imageBox.el().remove();
					
					/// Remove from selection if there
					this.imageBox.net.selected.delete(this);
					
					/// Delete base object
					this.imageBox.delete();
				},
				undo() {
					this.net.addTextBox(this.imageBox);
					this.imageBox.displayItem(this.net.outputEl);
				},
			});
		};

		if (o.prompt) {
			popupDialog($('<div>Are you sure?</div>'), {buttons: [
				$('<button type=button>').html('Delete').on('click', () => {
					let net = this.net;
					doDelete();
					dismissDialogs();
				}),
				$('<button type=button>').html('Cancel').on('click', dismissDialogs),
			]});
		}
		else {
			doDelete();
		}		
	},
	guiEdit(o = {}) {
		o = {
			combine: false,
			...o
		};
		
		this.el().attr("contenteditable", "");
		this.el().focus();
		document.execCommand('selectAll', false, null);
		this.el().one("blur", function() {
			$(this).removeAttr("contenteditable");
			window.getSelection().removeAllRanges();
			var $imageBox = $(this);
			var imageBox = currentBn.getItem(this);
			var newText = $imageBox[0].innerText;
			currentBn.changes.addAndDo({
				imageBox: imageBox,
				newText: newText,
				oldText: imageBox.text,
				withPrevious: o.combine,
				exec(text) {
					this.imageBox.setText(text);
					this.imageBox.el()[0].innerText = text;
				},
				redo() { this.exec(this.newText); },
				undo() { this.exec(this.oldText); },
			});
		});
	},
	/// NYI
	contextMenu() {
		return null;
		let textBox = this;
		let net = this.net;

		var whatsDirty = {};

		/** Options **/
		var $options = $('<div class=options>');
		var menu = Menu({type: "embedded", items: [
			MenuAction("<label>TextBox ID:</label> <input type=text data-control=textBoxId class=textBoxId value='"+toHtml(this.id)+"' pattern='[a-zA-Z_][a-zA-Z_0-9]*'>", function() { }),
			MenuAction("<label>Submodel:</label> <input type=text data-control=submodelPath class=submodelPath value='"+toHtml(this.getSubmodelPathStr())+"'>", function() { }),
			MenuAction(`
				<label>Dimensions:</label>
				W: <input type=text data-control=width class='width dimension' value='${toHtml(this.size.width)}'>
				H: <input type=text data-control=height class='height dimension' value='${toHtml(this.size.height)}'>
				`, function() { }),
			MenuAction("Delete...", function() {
				textBox.guiDelete({prompt: true});
			}),
		]});
		$options.append(menu.make());
		/** End options **/

		/** Format **/
		var $format = $('<div class=format>');
		var formatMenu = Menu({type: "embedded", items: [
			//MenuAction("<label>Background Color:</label> <input type=text data-control=backgroundColor class=backgroundColor value='"+toHtml(textBox.format.backgroundColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			//MenuAction("<label>Border Color:</label> <input type=text data-control=borderColor class=borderColor value='"+toHtml(textBox.format.borderColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("<label>Text Color:</label> <input type=text data-control=textColor class=textColor value='"+toHtml(textBox.format.fontColor)+"' pattern='#[a-fA-F_0-9]*' placeholder='[default]'>", function() { }),
			MenuAction("<label>Font Family:</label> <input type=text data-control=fontFamily class=fontFamily value='"+toHtml(textBox.format.fontFamily)+"' placeholder='[default]'>", function() { }),
			MenuAction("<label>Font Size:</label> <input type=text data-control=fontSize class=fontSize value='"+toHtml(textBox.format.fontSize)+"' pattern='[0-9]*' placeholder='[default]'>", function() { }),
		]});
		$format.append(formatMenu.make());
		/** End Format **/

		var tabs = new TabSet([
			{id: 'main', label: 'Options', content: $options, active: true},
			{id: 'format', label: 'Format', content: $format},
		]);

		net.changes.startCombined();
		popupEditDialog(tabs.$tabs, {className: 'node', 
			ondestroy() {
				console.log("DESTROYED");
				net.changes.endCombined();
			},
			controls: {
				width: {change(val) {
					net.changes.addAndDo({
						new: val, old: textBox.size.width,
						exec(current) {
							current = current && current>=0 ? current : '';
							let $displayNode = textBox.el();
							$displayNode.css('width', current);
							textBox.size.width = parseFloat(current);
						},
					});
				}},
				height: {change(val) {
					net.changes.addAndDo({
						new: val, old: textBox.size.height,
						exec(current) {
							current = current && current>=0 ? current : '';
							let $displayNode = textBox.el();
							$displayNode.css('height', current);
							textBox.size.height = parseFloat(current);
						},
					});
				}},
				backgroundColor: {change: function(val) {
					net.changes.addAndDo({
						new: val, old: textBox.format.backgroundColor,
						exec(current) {
							if (!current)  current = '';
							var $displayNode = textBox.el();
							$displayNode.css('background-color', current);
							textBox.format.backgroundColor = current;
						},
					});
				}},
				borderColor: {change: function(val) {
					/*var $displayNode = $('#display_'+node.id);
					$displayNode.css('border-color', val);
					$displayNode.find('h6').css('border-color', val);
					node.format.borderColor = val;*/
				}},
				textColor: {change: function(val) {
					net.changes.addAndDo({
						new: val, old: textBox.format.fontColor,
						exec(current) {
							if (!current)  current = '';
							var $displayNode = textBox.el();
							$displayNode.css('color', current);
							textBox.format.fontColor = current;
						},
					});
				}},
				fontFamily: {change: function(val) {
					net.changes.addAndDo({
						new: val, old: textBox.format.fontFamily,
						exec(current) {
							if (!current)  current = '';
							var $displayNode = textBox.el();
							$displayNode.css('font-family', current);
							textBox.format.fontFamily = current;
						},
					});
				}},
				fontSize: {change: function(val) {
					net.changes.addAndDo({
						new: val, old: textBox.format.fontSize,
						exec(current) {
							if (!current)  current = '';
							var $displayNode = textBox.el();
							$displayNode.css('font-size', current ? current+'pt' : '');
							textBox.format.fontSize = parseFloat(current);
						},
					});
				}},
				submodelPath: {change: function(val) {
					net.changes.addAndDo({
						new: val, old: textBox.getSubmodelPathStr(),
						exec(current) {
							textBox.setSubmodelPath(current);
							textBox.net.display();
							textBox.net.displayBeliefs();
						},
					});
				}},
				textBoxId: {change: function(val) {
					net.changes.addAndDo({
						new: val, old: textBox.id,
						exec(current) {
							let $displayNode = textBox.el();
							$displayNode.attr("id", 'display_'+current);
							textBox.rename(current);
							$displayNode.find('h6').html(currentBn.headerFormat(textBox.id,textBox.label));
							/*var $displayNode = $('#display_'+textBox.id);
							$displayNode.attr("id", 'display_'+val);
							textBox.rename(val);
							$displayNode.find('h6').html(currentBn.headerFormat(textBox.id,textBox.label));*/
						},
					});
				}},
			}
		});
	},
});

/** XXX This is currently just an arc helper, but should probably become a GuiArc class for
    more general management.
	XXX Yep. Merge into DisplayItem at some point
**/
class ArcSelector {
	constructor(p) {
		this.path = $(p)[0];
		/// Can get to clickable area via $(this.path).data('clickable')
		
		this.movePoints = [];
	}
	
	/// Needs merging with the version in DisplayItem
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
		this.updateMovePointHighlights();
	}
	
	updateMovePointHighlights() {
		/// Remove highlighted move points
		this.movePoints.forEach(el => el ? el.remove() : null);
		this.movePoints.length = 0;

		if (this.path.classList.contains('selected')) {
			/// Highlight move points
			let points = this.path.getPathData();
			/// No move point at start/end of line --- these are anchored to node center
			this.movePoints.push(null);
			for (let i=1; i<points.length-1; i++) {
				this.movePoints.push(n('svg:circle.movePoint', {
					cx: points[i].values[0], cy: points[i].values[1], r: 4, on: {
						mousedown: event => { this.movePoint_mousedown(event, i); event.stopPropagation(); }
				}}));
			}
			this.path.closest('svg').append(...this.movePoints);
		}
	}
	
	movePoint_mousedown(event, movePointI) {
		/// Snapping in a few places. Need to control with central config.
		let snapOn = true;
		let snapGridSize = 10;
		let svg = event.target.closest('svg');
		let {x: svgX, y: svgY} = svg.getBoundingClientRect();
		let points = this.path.getPathData();
		let mouseMove = null;
		let mouseUp = null;
		document.addEventListener('mousemove', mouseMove = event => {
			let newX = event.clientX-svgX, newY = event.clientY-svgY;
			let [parent,child] = this.getEndpoints();
			let parentBox = draw.getBox(parent.el()), childBox = draw.getBox(child.el());
			if (snapOn) {
				/// Calculate endpoint box centre points (just in case that's an adjacent point)
				let parentMidX = parentBox.x + parentBox.width/2;
				let parentMidY = parentBox.y + parentBox.height/2;
				let childMidX = childBox.x + childBox.width/2;
				let childMidY = childBox.y + childBox.height/2;
				
				/// Work out what the prev/next x/y points are
				let prevX = movePointI==1 ? parentMidX : points[movePointI-1].values[0];
				let prevY = movePointI==1 ? parentMidY : points[movePointI-1].values[1];
				let nextX = movePointI==points.length-2 ? childMidX : points[movePointI+1].values[0];
				let nextY = movePointI==points.length-2 ? childMidY : points[movePointI+1].values[1];
				
				if (movePointI-1>=0 && Math.floor(newX/snapGridSize) == Math.floor(prevX/snapGridSize)) {
					newX = prevX;
				}
				else if (movePointI+1<points.length && Math.floor(newX/snapGridSize) == Math.floor(nextX/snapGridSize)) {
					newX = nextX;
				}
				if (movePointI-1>=0 && Math.floor(newY/snapGridSize) == Math.floor(prevY/snapGridSize)) {
					newY = prevY;
				}
				else if (movePointI+1<points.length && Math.floor(newY/snapGridSize) == Math.floor(nextY/snapGridSize)) {
					newY = nextY;
				}
			}
			points[movePointI].values = [newX, newY];
			/// If movePointI is the second point, adjust first point (i.e. intersection with parent box)
			let nodeBox = null;
			if (movePointI == 1) {
				let intersects = draw.computeArrowBetweenBoxes(svg, parentBox, {x:newX,y:newY,width:0,height:0});
				let nodeBox = intersects[0].x == newX && intersects[0].y == newY ? intersects[1] : intersects[0];
				points[0].values = [nodeBox.x, nodeBox.y];
			}
			/// If movePointI is the second last point, adjust last point (i.e. intersection with child box)
			if (movePointI == points.length-2) {
				let intersects = draw.computeArrowBetweenBoxes(svg, {x:newX,y:newY,width:0,height:0}, childBox, {withMarker:true});
				let nodeBox = intersects[0].x == newX && intersects[0].y == newY ? intersects[1] : intersects[0];
				points[points.length-1].values = [nodeBox.x, nodeBox.y];
			}
			this.path.setPathData(points);
			this.movePoints[movePointI].setAttribute('cx', newX);
			this.movePoints[movePointI].setAttribute('cy', newY);
		});
		document.addEventListener('mouseup', mouseUp = event => {
			$(this.path).data('clickable')[0].setPathData(points);
			document.removeEventListener('mousemove', mouseMove);
			document.removeEventListener('mouseup', mouseUp, true);
		}, true);
	}

	getEndpoints() {
		let [parent,child] = $(this.path).data('endpoints');
		return [parent,child];
	}
	
	addPoint(x, y, o = {}) {
		o.nearest = o.nearest || false;
		o.index = o.index!==undefined ? o.index : -1;

		let points = this.path.getPathData();
		let pointDist = null;
		let insertAtI = null;
		if (o.nearest) {
			let closest = draw.getClosestSegmentPoint(points, [x,y]);
			console.log(closest);
			
			[x,y] = closest.point;
			if (o.index==-1)  insertAtI = closest.i+1;
		}
		else if (o.index != -1) { /// i is fixed. If x,y given, so too are they; if not, find good point
			insertAtI = o.index;
			
			if (x===null) {
				let A = points[insertAtI].values;
				let B = points[ insertAtI >= points.length-1 ? insertAtI-1 : insertAtI+1 ].values;
				let closest = draw.getClosestPointOnSegment([x,y], [A,B]);
				[x,y] = closest.point;
			}
		}
		else { /// x,y are fixed. Just need to find right segment
			let closest = draw.getClosestSegmentPoint(points, [x,y]);

			if (o.index==-1)  insertAtI = closest.i+1;
		}
		points.splice(insertAtI, 0, {type:'L', values:[x,y]});
		this.path.setPathData(points);
		
		/// Set same points for clickable
		$(this.path).data('clickable')[0].setPathData(points);
	}
	
	straighten() {
		let [parent,child] = this.getEndpoints();
		let intersects = draw.computeArrowBetweenBoxes(this.path.closest('svg'),
			draw.getBox(parent.el()), draw.getBox(child.el()), {withMarker: true});
		let newLine = [
			{type: 'M', values: [intersects[0].x, intersects[0].y]},
			{type: 'L', values: [intersects[1].x, intersects[1].y]},
		];
		this.path.setPathData(newLine);
		$(this.path).data('clickable')[0].setPathData(newLine);
	}
	
	isMultiPoint() {
		return this.path.getPathData().length > 2;
	}
	
	get clickable() {
		return $(this.path).data('clickable')[0];
	}
	
	/** Just removes the path (and it's gui selector) for the arc from the view **/
	removePath() {
		$(this.path).data('clickable').remove();
		$(this.path).remove();
		this.path = null;
	}
	
	/** Deletes the real arc in the graph **/
	delete() {
		let [parent,child] = this.getEndpoints();
		//onsole.log(parent.id, child.id);
		parent.removeChildren([child]);
	}
	
	guiDelete() {
		let arc = this;
		let [parent,child] = this.getEndpoints();
		let doArcDelete = (parent,child) => {
			let net = parent.net;
			//net.clearSelection();
			net.selected.delete(arc);
			net.changes.addAndDo({
				parent, child,
				redo() {
					this.child.guiRemoveParents([this.parent]);
				},
				undo() {
					this.child.guiAddParents([this.parent]);
					arc.path = net.outputEl.find(
						'#'+this.child.getVisibleItem().getPathIn(this.parent.getVisibleItem()).pathId)[0];
				},
			});
		};
		let deleteMultiple = parentChilds => {
			let arcs = n('ul.checklist', parentChilds.map(parentChild => {
				return n('li', n('label', n('input.sel', {type:'checkbox', value: JSON.stringify(parentChild.map(n=>n.id))}),
					n('span', html` ${parentChild[0].id} &rarr; ${parentChild[1].id}`)));
			}));
			let msg = [`Which arcs do you wish to delete?`, arcs];
			let net = parent.net;
			let $dialog = popupDialog(msg, {buttons: [
				n('button', 'Delete', {type: 'button', on: {click() {
					let selected = $dialog.find('.sel:checked').get().map(n => JSON.parse($(n).val()));
					let [visParent,visChild] = selected[0].map(id => net.find(id).getVisibleItem());
					net.changes.doCombined(_=> {
						for (let [parentId, childId] of selected) {
							//doArcDelete(net.find(parentId), net.find(childId));
							net.find(parentId).guiRemoveChildren([net.find(childId)]);
						}
					});
					net.changes.addFinallyAndDo(_=> {
						let pathOut = visParent.getPathOut(visChild);
						if (pathOut) {
							arc.path = net.outputEl.find(pathOut.pathId)[0];
						}
						else {
							arc.path = null;
						}
					});
					dismissDialogs();
				}}}),
				n('button', 'Cancel', {type: 'button', on: {click() {
					dismissDialogs();
				}}})
			]});
		}
		let arcs = [];
		if (parent instanceof Submodel && child instanceof Submodel) {
			let allParentNodes = parent.getAllNodes();
			let allChildNodes = child.getAllNodes();
			for (let parent of allParentNodes) {
				let parentsChildren = parent.children.filter(c => allChildNodes.includes(c));
				for (let parentsChild of parentsChildren) {
					arcs.push([parent, parentsChild]);
				}
				let parentsParents = parent.parents.filter(p => allChildNodes.includes(p));
				for (let parentsParent of parentsParents) {
					arcs.push([parentsParent, parent]);
				}
			}
			//alert('Not yet supported when parent or child is submodel');
			deleteMultiple(arcs);
		}
		else if (parent instanceof Submodel) {
			let allParentNodes = parent.getAllNodes();
			let matchingParents = allParentNodes.filter(p => p.children.includes(child));
			for (let parent of matchingParents) {
				arcs.push([parent, child]);
			}
			matchingParents = allParentNodes.filter(p => p.parents.includes(child));
			for (let parent of matchingParents) {
				arcs.push([child, parent]);
			}
			//alert('Not yet supported when parent or child is submodel');
			deleteMultiple(arcs);
		}
		else if (child instanceof Submodel) {
			let allChildNodes = child.getAllNodes();
			let matchingChildren = allChildNodes.filter(c => c.parents.includes(parent));
			for (let child of matchingChildren) {
				arcs.push([parent, child]);
			}
			matchingChildren = allChildNodes.filter(c => c.children.includes(parent));
			for (let child of matchingChildren) {
				arcs.push([child, parent]);
			}
			//alert('Not yet supported when parent or child is submodel');
			deleteMultiple(arcs);
		}
		else {
			arcs = [[parent, child]];
			doArcDelete(parent, child);
		}
		console.log(arcs.map(pair => `${pair[0].id} => ${pair[1].id}`));
	}
	
	contextMenu(event) {
		var menu = Menu({type: 'contextMenu', items: [
			MenuAction('Add Point [NYI]', () => {
				let {x: svgX, y: svgY} = this.path.closest('svg').getBoundingClientRect();
				let [x,y] = [event.clientX-svgX, event.clientY-svgY];
				this.addPoint(x,y, {nearest:true});
				$('.contextMenu').remove();
				/// Now select the arc, if not already selected
				this.guiToggleSelect({on:true});
			}),
			this.isMultiPoint() ? MenuAction('Straighten', () => {
				this.straighten();
				$('.contextMenu').remove();
			}) : null,
			MenuAction('Delete', async () => {
				$('.contextMenu').remove();
				this.guiDelete();
			}),
		]});
		menu.popup({left:event.clientX, top:event.clientY});
	}
}

Definition.Editor = class {
	constructor(...args) {
		/// Replace with def type. Must match def type string.
		this.type = 'NOTYPE';
		/// This needs to be here because of the bizarre constraint in which super() needs
		/// to be the first statement
		this.setType();
		addObjectLinks(this);
		this.init(...args);
	}
	
	init(node, parents, def, rootEl) {
		this.node = node;
		/// XXX parents in node or outside?
		//this.parents = parents;
		this.node.parents = parents;
		this.def = def.type == this.type ? def.duplicate() : this.getDefVersion(def);
		this.rootEl = rootEl;
	}
	
	setType() { this.type = 'NOTYPE'; }
	
	/** Implement all the following **/
	/// Return a version of def that is compatible with current editor
	getDefVersion(oldDef) {}
	
	/// overwrite this.rootEl with new editor
	make(o = {}) {}
	
	/// handle message update
	//handleObjectUpdate(m, updateId = null) {}
	
	/// return message update
	getDefinitionUpdateMessage() {}
}

/// GUI for definition editing. |make| creates the editor.
/// |getDefinitionUpdateMessage| returns a message that can be used to update the original node.
CPT.Editor = class extends Definition.Editor {
	/// node is actually just some of node's properties. Need to fix name.
	constructor(...args) {
		super(...args);
		this.hasToolbar = true;
		window.lastCptEditor = this;
	}
	
	setType() { this.type = 'CPT'; }
	
	getCellValue(cell) {
		return Number(cell.textContent);
	}
	
	getCellForCopy(cell) {
		return cell.cloneNode(true);
	}

	setCellValue(td, val) {
		let prob = td.querySelector('.prob');
		let newNum = Math.round(Number(val)*100000)/100000;
		if (!isNaN(newNum)) {
			prob.textContent = toChance(sigFig(newNum,3));
			this.setCellBackground(td);
		}
		else {
			console.log("Not num:", val);
		}
	}
	
	setCellBackground(td) {
		let valStr = td.querySelector(".prob").textContent;

		if (valStr.search(/^\s*(0|1|0?\.\d+)\s*/)!=-1) {
			let v = parseFloat(valStr);
			if (v >= 0 && v <= 1) {
				let n = td.closest('tr').rowIndex % 2;
				/*td.style.backgroundImage = 
					"linear-gradient(to top,var(--cpt-background"+n+"),"+toPercent(v)+",var(--cpt-background"+n+"),"+toPercent(v)+",transparent)";*/
				td.style.setProperty('--prob', v);
			}
		}
	}

	addStateHeader(tr, id, pos = -1) {
		let th = document.createElement('th');
		th.append(n('div.move'));
		th.className = 'stateLabel';
		let span = document.createElement('span');
		span.className = 'stateId';
		span.setAttribute('data-control', 'state');
		span.setAttribute('contenteditable', 'true');
		span.setAttribute('title', id);
		span.textContent = id;
		th.appendChild(span);
		if (pos == -1) {
			tr.appendChild(th);
		}
		else {
			tr.cells[pos].after(th);
		}
	}
	
	addStateEntry(tr, prob, pos = -1) {
		let td = document.createElement('td');
		let span = document.createElement('span');
		span.className = 'prob';
		span.setAttribute('data-control', 'cpt');
		span.setAttribute('contenteditable', 'true');
		span.setAttribute('inputmode', 'numeric');
		span.textContent = toChance(sigFig(prob,3));
		td.appendChild(span);
		if (pos == -1) {
			tr.appendChild(td);
		}
		else {
			tr.cells[pos].after(td);
		}
		this.setCellBackground(td);
	}
	
	// byRow doesn't wrap, but by cell does. Maybe not great consistency...
	moveToCell(originalInput, numMoves, o = {}) {
		o.byRow ??= false;
		
		let moveType = o.byRow ? 'tr' : 'td';
		let step = numMoves/Math.abs(numMoves);
		let siblingType = 'nextSibling';
		let firstOfTr = ':first-of-type';
		if (step < 0) {
			siblingType = 'previousSibling';
			firstOfTr = ':last-of-type';
		}
		let currentInput = originalInput;
		for (let i=0; i != numMoves; i += step) {
			if (o.byRow) {
				let siblingTr = currentInput.closest('tr')[siblingType];
				if (siblingTr) {
					let inputEl = siblingTr.cells[currentInput.closest('th,td').cellIndex]?.querySelector?.('[contenteditable]');
					if (inputEl) {
						currentInput = inputEl;
					}
					else {
						/// If nothing applicable, just return original prob
						return originalInput;
					}
				}
			}
			else {
				let sibling = currentInput.closest('td, th')[siblingType];
				while (!sibling || !sibling.querySelector('[contenteditable]')) {
					let trSibling = currentInput.closest('tr')[siblingType];
					if (!trSibling || !trSibling.querySelector('[contenteditable]')) {
						/// If nothing applicable, just return original prob
						return originalInput;
					}
					sibling = trSibling.querySelector('td'+firstOfTr);
					if (!sibling) {
						sibling = trSibling.querySelector('th'+firstOfTr);
					}
				}
				currentInput = sibling.querySelector('[contenteditable]');
			}
		}
		
		return currentInput;
	}
	
	/** These are common between CPTs and CDTs.
	XXX: Need to bring across as much func as I can, including paste events, etc.
	**/
	addSelectEvents(rootEl) {
		let mdCell = null;
		rootEl.addEventListener('mousedown', event => {
			mdCell = event.target.closest('td, th');
			mdCell.closest('table').querySelectorAll('.cellSelected').forEach(c => c.classList.remove('cellSelected'));
			if (mdCell.matches('th:not(.stateLabel)')) {
				event.preventDefault();
			}
			console.log('md');
			document.addEventListener('mouseup', event => {
				if (mdCell) {
					if (mdCell.closest('table').querySelector('.cellSelected')) {
						/// Need to have a real focus, otherwise pastes won't work
						let edit = mdCell.querySelector('[contenteditable]') || mdCell.closest('table').querySelector('[contenteditable]');
						selectContents(edit);
						setCaretEnd(edit);
					}
					mdCell = null;
				}
			}, {once: true});
		});
		rootEl.addEventListener('mousemove', event => {
			let currentCell = event.target.closest('td, th');
			if (mdCell && currentCell) {
				mdCell.closest('table').querySelectorAll('.cellSelected').forEach(c => c.classList.remove('cellSelected'));
				if (mdCell != currentCell) {
					document.getSelection().empty();
					let currentR = currentCell.closest('tr').rowIndex;
					let currentC = currentCell.cellIndex;
					let mdR = mdCell.closest('tr').rowIndex;
					let mdC = mdCell.cellIndex;
					let rowDir = Math.sign(currentR - mdR) || 1;
					let colDir = Math.sign(currentC - mdC) || 1;
					console.log(currentR, currentC, mdR, mdC, rowDir, colDir);
					for (let r = mdR; r != (currentR+rowDir); r += rowDir) {
						for (let c = mdC; c != (currentC+colDir); c += colDir) {
							mdCell.closest('table').rows[r].cells[c].classList.add('cellSelected');
						}
					}
				}
				event.preventDefault();
				console.log('mm', mdCell, currentCell, event.target);
			}
		});
		rootEl.addEventListener('focusout', event => {
			rootEl.querySelectorAll('.cellSelected').forEach(c => c.classList.remove('cellSelected'));
		});
	}
	
	/// Function for setup of table events
	addEvents(rootEl) {
		rootEl = rootEl.querySelector('.CPT');
		
		rootEl.addEventListener("input", event => {
			let el = null;
			if ( (el=event.target.closest('.prob')) ) {
				this.setCellBackground(el.closest("td"));
				/// This row was possibly set to invalid. Clear, if any change made
				el.closest("tr").classList.remove("invalid");
			}
			else if ( (el=event.target.closest('th span')) ) {
				//var stateI = $(this).closest('th')[0].cellIndex - node.parents.length;
				//console.log("stateI:", stateI);
				//node.renameStates( {[stateI]: this.innerText} );
				el.setAttribute('title', el.textContent);
				let states = [...el.closest('tr').querySelectorAll('.stateId')].map(el => ({id: el.textContent}));
				this.updateLinkedObjects({states});
			}
		}, true);
		this.addSelectEvents(rootEl);
		rootEl.addEventListener('mousedown', event => {
			let el = null;
			if ( (el=event.target.closest('td')) && el.querySelector('.prob') ) {
				//console.log('x');
				if (this.probFocused != el.querySelector('.prob')) {
					//console.log('y');
					document.addEventListener('mouseup', event => {
						this.probFocused = el.querySelector('.prob');
						selectContents(this.probFocused);
					}, {capture: true, once: true});
				}
			}
		});
		let focusOrClick = event => {
			let el = null;
			if ( (el=event.target.closest('.prob, *[contenteditable]')) ) {
				this.probFocused = event.target;
				selectContents(el);
				console.log('hi');
				//$(el).one('mouseup', event => selectContents(el));
			}
		};
		rootEl.addEventListener('focus', focusOrClick, true);
		rootEl.addEventListener('keydown', event => {
			let el = event.target.closest('.prob');
			if (el) {
				/// Not sure why I called this dumpRemainder, but it calcs 1 - everything else,
				/// and then puts it in el
				function dumpRemainder(el) {
					let otherProbs = [...el.closest('tr').querySelectorAll('.prob')].filter(e => e != el);
					let sumOtherProbs = otherProbs.map(el => Number(el.textContent)).reduce((a,v)=>a+v);
					let thisProb = Math.min(1, Math.max(0, 1 - sumOtherProbs));
					el.textContent = toChance(thisProb);
				}
				/// An extra . should move automatically to next cell
				if (event.key == '.' && getCaretPosition(el).atEnd && el.textContent.search(/\./) != -1) {
					event.preventDefault();
					if (el.textContent.trim() == '.') {
						dumpRemainder(el);
						this.setCellBackground(el.closest('td'));
						setCaretEnd(el);
					}
					else {
						let newProb = this.moveToCell(el, 1);
						this.probFocused = newProb;
						newProb.textContent = '.';
						/// Need to do both, otherwise focus event above triggers (and I can't
						/// seem to use any stop functions to prevent it)
						selectContents(newProb);
						setCaretEnd(newProb);
					}
				}
				else if (event.key == 'F1') {
					/// Complete
					dumpRemainder(el);
					this.setCellBackground(el.closest('td'));
				}
				else if (event.key == 'F10') {
					/// Normalise
					let rowProbs = [...el.closest('tr').querySelectorAll('.prob')];
					let sumRowProbs = rowProbs.map(el => Number(el.textContent)).reduce((a,v)=>a+v);
					rowProbs.forEach(p => p.textContent = toChance(sigFig(Number(p.textContent)/sumRowProbs, 3)));
					rowProbs.forEach(p => this.setCellBackground(p.closest('td')));
					event.preventDefault();
				}
			}
			el = event.target.closest('[contenteditable]');
			if (el) {
				if (event.key == 'ArrowUp' || event.key == 'ArrowDown') {
					let col = el.closest('td, th').cellIndex;
					let prevRow = el.closest('tr').previousSibling;
					if (prevRow) {
						this.probFocused = this.moveToCell(el, event.key == 'ArrowUp' ? -1 : 1, {byRow: true});
						selectContents(this.probFocused);
					}
					event.preventDefault();
				}
				else if (event.key == 'ArrowLeft' || event.key == 'ArrowRight') {
					if (el.closest('th') && event.ctrlKey) {
						let dir = event.key == 'ArrowLeft' ? -1 : 1;
						let table = el.closest('table');
						let th = el.closest('th');
						let colI = th.cellIndex;
						let firstColI = table.querySelector('tr th.stateLabel').cellIndex;
						let stateI = colI - firstColI;
						
						let otherStateI = Math.min(Math.max(stateI + dir,0),this.node.states.length);
						if (otherStateI != stateI) {
							table.querySelectorAll('tr').forEach(tr => {
								if (tr.matches('.nodeTitleTr'))  return;
								let cell = tr.querySelector(`:scope > *:nth-child(${1+ firstColI+stateI})`);
								let otherCell = tr.querySelector(`:scope > *:nth-child(${1 + firstColI+otherStateI})`);
								if (dir == -1)  otherCell.before(cell);
								else            otherCell.after(cell);
							});
							
							/// XXX This doesn't do anything other than change the view yet!
							this.updateLinkedObjects({
								_moveState: {
									oldI: stateI,
									newI: otherStateI,
								}
							});
							
							/// XXX probFocused should just be cellFocused
							this.probFocused = el;
							selectContents(this.probFocused);
						}
						
						event.preventDefault();
					}
					else {
						/// Only enable when: 1) ArrowLeft when selection starts at left edge or 2) ArrowRight when sel ends at right edge.
						let selRange = window.getSelection().getRangeAt(0);
						let containerLength =  selRange.commonAncestorContainer?.length ?? selRange.commonAncestorContainer.childNodes.length;
						if ((event.key == 'ArrowLeft' && selRange.startOffset == 0)
							|| (event.key == 'ArrowRight' && selRange.endOffset == containerLength)) {
							let col = el.closest('td, th').cellIndex;
							let prevRow = el.closest('tr').previousSibling;
							if (prevRow) {
								this.probFocused = this.moveToCell(el, event.key == 'ArrowLeft' ? -1 : 1);
								selectContents(this.probFocused);
							}
							event.preventDefault();
						}
					}
				}
				else if (event.key == 'Enter') {
					setCaretEnd(this.probFocused);
					event.preventDefault();
				}
			}
		});
		let copyEvent;
		document.addEventListener('keydown', copyEvent = event => {
			if (!document.contains(rootEl)) {
				/// Get rid of me when I'm not in the document any more
				document.removeEventListener('keydown', copyEvent);
				return;
			}
			/// Only copy if app.windowFocus is on this "window"
			if (app.windowFocus.contains(rootEl.querySelector('.cellSelected'))) {
				if (event.ctrlKey && event.key == 'c') {
					let sels = rootEl.querySelector('.cellSelected');
					console.log('x', sels);
					if (sels) {
						event.preventDefault();
						this.copyAll(event,false,true);
					}
				}
				else if (event.ctrlKey && event.key == 'v') {
					let sel = rootEl.querySelector('.cellSelected');
					console.log('x', sel);
					if (sel) {
						sel.querySelector('[contenteditable]').focus();
					}
				}
			}
		});
		let handlePaste = event => {
			let el = event.target.closest('table [contenteditable]');
			if (el) {
				let sels = [...rootEl.querySelectorAll('.cellSelected')];
				let cell = sels.length ? sels[0] : el.closest('td, th');
				let text = event.clipboardData.getData('text');
				console.log(text);
				let data = text.split(/\r?\n/).map(row => row.split(/\t/));
				console.log(data);
				let offset = (node, dx, dy) => {
					let thisX = [...node.parentNode.children].indexOf(node);
					let thisY = [...node.parentNode.parentNode.children].indexOf(node.parentNode);
					return node.parentNode.parentNode.children[thisY + dy]?.children?.[thisX + dx];
				};
				
				/// Map the incoming data to match the area to paste to
				/// (using recycling)
				if (sels.length) {
					/// Expensive...
					let cellIndexes = sels.map(c => c.cellIndex);
					let rowIndexes = sels.map(c => c.parentNode.rowIndex);
					let cellLength = Math.max(...cellIndexes) - Math.min(...cellIndexes) + 1;
					let rowLength = Math.max(...rowIndexes) - Math.min(...rowIndexes) + 1;
					
					let dataR = 0;
					for (let r=0; r<rowLength; r++) {
						if (r >= data.length) {
							data.push(data[dataR]);
							dataR++;
						}
						let dataC = 0;
						for (let c=data[r].length; c<cellLength; c++) {
							data[r].push(data[r][dataC]);
							dataC++;
						}
					}
				}
				
				for (let [r,row] of data.entries()) {
					if (!offset(cell, 0, r))  break;
					for (let [c,val] of row.entries()) {
						let entry = offset(cell, c, r)?.querySelector?.('[contenteditable]');
						if (!entry)  break;
						/// If it's a header, make sure it's a valid id
						if (entry.closest('th')) {
							val = makeValidId(val);
						}
						else {
							/// Check if valid number. If not, skip
							if (isNaN(val))  continue;
						}
						//cell.textContent = val;
						// support simple undo
						selectContents(entry);
						document.execCommand('insertHTML', false, val);
					}
				}
				event.preventDefault();
			}
		};
		
		let pasteEvent;
		document.addEventListener('paste', pasteEvent = event => {
			if (!document.contains(rootEl)) {
				/// Get rid of me when I'm not in the document any more
				document.removeEventListener('keydown', copyEvent);
				return;
			}
			/// Only paste if app.windowFocus is on this "window"
			if (app.windowFocus.contains(rootEl.querySelector('.cellSelected'))) {
				let sels = rootEl.querySelector('.cellSelected');
				console.log('y', sels);
				if (sels) {
					event.preventDefault();
					handlePaste(event);
				}
			}
		}, true);
		
		rootEl.addEventListener('paste', handlePaste);
		/*".prob", function() {
			}).on("focus", ".prob", event => {
				this.probFocused = event.target;
			}).on("input", "th span", function() {
			}).on('keydown', 'th span', function(event) {
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
			});*/
		
		rootEl.addEventListener('mousedown', event => {
			let moveEl = event.target.closest('.move');
			console.log(event.target);
			if (moveEl) {
				//con
				event.stopPropagation();
				let th = moveEl.closest('th');
				/// Move states
				if (th.matches('.stateLabel')) {
					
				}
				/// Move parents
				else {
					let label = th.textContent;
					let moving = n('div.movingColumn');
					document.body.append(moving);
					let mm = null, mu = null;
					document.addEventListener('mousemove', mm = event => {
						console.log('moving');
						moving.style.left = event.clientX+'px';
						moving.style.right = event.clientY+'px';
						event.stopPropagation();
					}, true);
					document.addEventListener('mouseup', mu => event => {
						moving.remove();
						document.removeEventListener('mousemove', mm);
						document.removeEventListener('mouseup', mu);
					});
				}
			}
		});
	}
	
	addStateColumn(table, afterPos, id) {
		let nodeTitleTh = table.querySelector('.nodeTitle');
		nodeTitleTh.setAttribute('colspan', Number(nodeTitleTh.getAttribute('colspan'))+1);
		this.addStateHeader(table.querySelector('.thisNodeStates'), id, afterPos);
		table.querySelectorAll('td:last-child').forEach(el => {
			this.addStateEntry(el.closest('tr'), 0, afterPos);
		});
	}
	
	removeStateColumn(table, cellPos) {
		table.querySelectorAll(`tr:not(.nodeTitleTr) th:nth-child(${cellPos+1}), tr:not(.nodeTitleTr) td:nth-child(${cellPos+1})`).forEach(el => el.remove());
		let nodeTitleTh = table.querySelector('.nodeTitle');
		nodeTitleTh.setAttribute('colspan', Number(nodeTitleTh.getAttribute('colspan'))-1);
	}
	
	moveParent(parentI, toI) {
		let cptTable = this.rootEl.querySelector('.CPT');
		let oldParents = this.node.parents.slice();
		
		/// We'll need to create a shadow definition first
		let tempNode = Object.assign(Object.create(Node.prototype), this.node);
		if (!this.shadowDef) {
			this.shadowDef = new CPT(this.def);
		}
		this.shadowDef.node = tempNode;
		tempNode.def = this.shadowDef;

		/// Now we can update our parents
		tempNode.moveParents({moves: {[parentI]: toI}});
		tempNode.def = null;
		
		/// And update the view
		/// Move col
		[...cptTable.rows].forEach(r => r.matches(':not(.nodeTitleTr)') && r.cells[toI].before(r.cells[parentI]));
		/// Rewrite parent states
		this.node.parents = tempNode.parents;
		let parents = this.node.parents;
		let parentIndexes = setupIndexes(parents);
		let r = 0;
		let rowOffset = 2;
		do {
			parentIndexes.forEach((stateI,parentI) => {
				let parentStateCell = cptTable.rows[rowOffset + r].cells[parentI];
				parentStateCell.textContent = parents[parentI].states[stateI].id;
			});
			r++;
		} while (nextCombination(parents, parentIndexes));
		
		/// Update CPT view
		cptTable.querySelectorAll('.prob').forEach((input,i) => {
			this.setCellValue(input.closest('td'), this.shadowDef.cpt[i]);
		});
		
		/// Now, send the message to my linked objects
		let parentOrder = this.node.parents.map(p => oldParents.indexOf(p));
		console.log(this.node.parents, parentOrder);
		this.updateLinkedObjects({
			'_moveParents': {
				order: parentOrder,
			},
		});
	}
	
	prepareTable(type) {
		let node = this.node;
		let parents = this.node.parents;

		var table = document.createElement('table');
		table.className = type;
		var numParentCombinations = parents.reduce((a,v) => a * v.states.length, 1);
		var parentIndexes = setupIndexes(parents);
		/// Show name of current node
		console.log(node.id);
		let nodeTitleTr = n('tr.nodeTitleTr',
			parents.length ? n('th', {colspan: parents.length}) : null,
			n('th.nodeTitle', {colspan: node.states.length}, node.id),
		);
		table.appendChild(nodeTitleTr);
		/// Write out header
		var header = document.createElement('tr');
		header.className = 'thisNodeStates';
		for (let i=0; i<parents.length; i++) {
			let parent = parents[i];
			let th = document.createElement('th');
			th.textContent = parent.id;
			th.append( n('div.move') );
			header.appendChild( th );
		}
		table.appendChild(header);
		/// Write out each row
		for (var i=0; i<numParentCombinations; i++) {
			var tr = document.createElement('tr');
			for (let k=0; k<parents.length; k++) {
				let parent = parents[k];
				//tr.appendChild( n('th', parent.states[parentIndexes[k]].id) );
				let th = document.createElement('th');
				th.textContent = parent.states[parentIndexes[k]].id;
				tr.appendChild(th);
			}
			table.appendChild(tr);
			nextCombination(parents, parentIndexes);
		}
		return table;
	}
	
	getDefVersion(oldDef) {
		return oldDef.getCptVersion();
	}
	
	copyAll(event,transposed=false,selected=false) {
		let table = this.rootEl.querySelector('table');
		/// We copy the visible HTML table (not the table in the model), because
		/// we want any user changes not committed yet.
		let tableToCopy = table;
		if (transposed || selected) {
			let newTable = n('table');
			/// Set the selection bounds if doing selected
			let startR = 0, endR = table.rows.length;
			let startC = 0, endC = 10000000;
			if (selected) {
				let cellSels = table.querySelectorAll(selected==='all' ? 'td, th' : '.cellSelected');
				startC = cellSels[0].cellIndex;
				startR = cellSels[0].parentNode.rowIndex;
				let lastSel = cellSels[cellSels.length-1];
				endC = lastSel.cellIndex + 1;
				endR = lastSel.parentNode.rowIndex + 1;
			}
			for (let r=startR; r<endR; r++) {
				let _endC = Math.min(endC, table.rows[r].cells.length);
				for (let c=startC; c<_endC; c++) {
					if (!transposed) {
						/// Not enough rows? Add them
						while (newTable.rows.length <= r - startR) {
							newTable.append(n('tr'));
						}
						let newCell = this.getCellForCopy(table.rows[r].cells[c]);
						newTable.rows[r-startR].append(newCell);
					}
					else {
						/// Not enough rows? Add them
						while (newTable.rows.length <= c  - startC) {
							newTable.append(n('tr'));
						}
						let newCell = this.getCellForCopy(table.rows[r].cells[c]);
						newTable.rows[c - startC].append(newCell);
						let rowSpan = newCell.getAttribute('colspan');
						if (rowSpan) {
							newCell.setAttribute('rowspan', rowSpan);
							newCell.removeAttribute('colspan');
						}
					}
				}
			}
			tableToCopy = newTable;
		}
		copyHtmlToClipboard(tableToCopy.outerHTML);
	}
	
	make(o = {}) {
		this.hasToolbar = defaultGet(o.toolbar, this.hasToolbar);
		
		let node = this.node;
		
		/*let startTime = performance.now();
		for (let i=0; i<100; i++) {
			node._prepTable2("cpt");
		}
		console.log(performance.now() - startTime);

		startTime = performance.now();
		for (let i=0; i<100; i++) {
			node._prepTable("cpt");
		}
		console.log(performance.now() - startTime);*/
		let panel = n('form', {onsubmit: 'return false'});
		/// Setup the table DOM
		let table = this.prepareTable(this.type);
		
		if (this.hasToolbar) {
			panel.append(n('div.toolbar',
				n('button', '+State', {class: 'defAddState', on:{click:() => {
					//node.addStates(['state'+node.states.length], {updateChildren: false});
					let cellPos = -1;
					let i = node.states.length;
					while (node.states.find(s => s.id=='state'+i))  i++;
					let stateId = 'state'+i;
					let stateIndex = node.states.length;
					if (this.probFocused) {
						cellPos = this.probFocused.closest('td, th').cellIndex;
					}
					this.addStateColumn(table, cellPos, stateId);
					stateIndex = cellPos - this.node.parents.length + 1;
					selectContents(table.querySelector(`.thisNodeStates th:nth-child(${cellPos+2})`));
					this.probFocused = this.probFocused.closest('td, th').nextSibling;
					this.updateLinkedObjects({
						'_addState': {
							index: stateIndex,
							id: stateId,
						}
					});
					panel.querySelector('.defRemoveState').disabled = false;
				}}}),
				n('button', '-State', {class: 'defRemoveState', on:{click: event => {
						let cellPos = this.probFocused.closest('td, th').cellIndex;
						//node.removeStates([stateNum], {updateChildren: false});
						this.removeStateColumn(table, cellPos);
						this.updateLinkedObjects({
							'_removeState': {
								index: cellPos - this.node.parents.length
							}
						});
						panel.querySelector('.defRemoveState').disabled = node.states.length <= 1;
					}},
					disabled: node.states.length <= 1 ? true : null,
				}),
				n('button.copy', 'Copy', {on:{click: event => {
					let copyAll = (event,transposed,selected) => {
						this.copyAll(event,transposed,selected);
						event.stopPropagation();
						menu.dismiss();
					};
					let copyBare = (event,transposed=false) => {
						let msg = this.getDefinitionUpdateMessage();
						let cpt2d = Array.from({length:msg.cpt.length/msg._numStates}, (_,i) => msg.cpt.slice(i*msg._numStates, (i+1)*msg._numStates));
						if (transposed) {
							/// Transpose it
							cpt2d = cpt2d[0].map((_,i) => cpt2d.map(r => r[i]));
						}
						copyTextToClipboard(cpt2d.map(r => r.join('\t')).join('\n'));
						event.stopPropagation();
						//event.preventDefault();
						menu.dismiss();
					};
					let hasSel = event.target.closest('.defBody').querySelector('.cellSelected');
					let menu = new Menu({type: "contextMenu", items: [
						MenuAction('Copy All', copyAll),
						MenuAction('Copy All (Transposed)', event => copyAll(event,true)),
						MenuAction('Copy Bare CPT', copyBare),
						MenuAction('Copy Bare CPT (Transposed)', event => copyBare(event,true)),
						hasSel && MenuAction('Copy Selected', event => copyAll(event,false,true)),
						hasSel && MenuAction('Copy Selected (Transposed)', event => copyAll(event,true,true)),
					]});
					let rect = event.target.getBoundingClientRect();
					menu.popup({left: rect.left, top: rect.bottom});
				}}}),
			));
		}

		/*let numStatesDiff = 0;
		
		if (node._statesChanges) {
			numStatesDiff = node._statesChanges.added.length - node._statesChanges.deleted.length;
		}
		console.log(JSON.stringify(node._statesChanges));*/
		
		/// Use shadowDef, if available
		let def = this.shadowDef || this.def;
		
		let tr = table.querySelector('tr.thisNodeStates');
		/// Track last cpt entry that had the focus
		let probFocused = null;
		for (let j=0; j<node.states.length; j++) {
			this.addStateHeader(tr, node.states[j].id);
		}
		let firstRowI = tr.rowIndex+1;
		for (let i=0; i<def.getNumRows(); i++) {
			let row = def.getRow(i);
			let tr = table.rows[firstRowI+i];
			/// Now list the distro for each row
			for (let j=0; j<node.states.length; j++) {
				// console.log(tr, j, firstRowI, i , table);
				if (j >= node.states.length) {
					this.addStateEntry(tr, 0);
				}
				else {
					this.addStateEntry(tr, row[j]);
				}
			}
		}
		panel.append(table);
		
		this.addEvents(panel);
		
		this.rootEl.innerHTML = '';
		this.rootEl.append(panel);
	}
	
	handleObjectUpdate(m, updateId = null) {
		console.log('def update', JSON.stringify(m));
		let numStatesChanged = false;
		let redoTable = false;
		/// If def is in the message, we need to start again
		if (m.def) {
			/// Definition will be kept up to date by the context menu
			redoTable = true;
			delete this.shadowDef;
		}
		else {
			/// Shadow the definition, if we see any changes to the states
			numStatesChanged = (m._addState!==undefined || m._removeState!==undefined);
			if (numStatesChanged && !this.shadowDef) {
				this.shadowDef = new CPT(this.def);
				this.shadowDef.node = this.node;
			}
			if (m._addState) {
				let {index} = m._addState;
				let newNumStates = this.node.states.length;
				let oldNumStates = newNumStates - 1;
				this.shadowDef.updateStates({oldNumStates, newNumStates, insertPoint: index});
			}
			else if (m._removeState) {
				let {index} = m._removeState;
				let newNumStates = this.node.states.length;
				let oldNumStates = newNumStates + 1;
				this.shadowDef.updateStates({oldNumStates, newNumStates, removedI: [index]});
			}
			/// If states changed, but no states added/removed (or moved), then just relabel
			if (m.states) {
				/// Just update the state ids, if needed
				this.rootEl.querySelectorAll('.stateLabel .stateId').forEach((el,i) => {
					el.textContent = m.states[i].id;
					el.setAttribute('title', m.states[i].id);
				});
			}
		}

		if ((numStatesChanged || redoTable) && this.rootEl.matches('.definitionMade')) {
			console.log('make again');
			/// Make it again, sam
			/// Obviously, inefficient
			this.make();
		}
	}
	
	/// Read out the change state from the panel, and turn it into a message.
	/// Definitions can use this to update (i.e. patch) themselves
	/// (This message is just for definitions.)
	/// Returns: {invalid: <string or undefined>, cpt: array<float>}
	getDefinitionUpdateMessage() {
		let m = {};
		
		let hasDefEditor = this.rootEl.matches('.definitionMade');
		let numStates = this.rootEl.querySelectorAll('.CPT .stateLabel').length;
		let probs = [...this.rootEl.querySelectorAll('.CPT .prob')].map(el => parseFloat(el.textContent));
		let numRows = probs.length/numStates;
		
		if (!numStates && this.shadowDef) {
			numStates = this.node.states.length;
			probs = this.shadowDef.cpt;
			numRows = probs.length/numStates;
		}
		
		/// If the CPT table exists, put it into the message
		if (numStates) {
			let firstRowI = hasDefEditor ? this.rootEl.querySelector('tr.thisNodeStates').rowIndex+1 : 0;
			for (let r=0; r<numRows; r++) {
				let sum = 0;
				for (let c=0; c<numStates; c++) {
					//console.log(r, c, nodeDup.states.length, r*nodeDup.states.length + c);
					sum += probs[r*numStates + c];
				}
				//console.log(r, sum, newCpt, nodeDup.states, nodeDup.def.cpt, node.def.cpt);
				if (Math.round(sum*1000) != 1000) {
					m.invalid = 'One or more rows do not sum to 1';
					if (hasDefEditor)  this.rootEl.querySelector(`.CPT tr:nth-child(${firstRowI + r + 1})`).classList.add("invalid");
				}
			}
			
			m.cpt = probs;
			m._numStates = numStates;
		}
		
		return m;
	}
}

CDT.Editor = class extends CPT.Editor {
	constructor(...args) {
		super(...args);
	}
	
	setType() { this.type = 'CDT'; }
	
	getCellValue(cell) {
		return Number(cell.querySelector('input').checked);
	}
	
	getCellForCopy(cell) {
		console.log('x');
		if (cell.querySelector('input')) {
			return n('td', this.getCellValue(cell));
		}
		return cell.cloneNode(true);
	}
	
	copyAll(event,transposed=false,selected=false) {
		/// This is to trigger using getCellForCopy (rather than straight table copy)
		return super.copyAll(event,transposed,selected || 'all');
	}

	getDefVersion(oldDef) {
		if (oldDef.type == 'CDT')  return oldDef;
		
		let cpt = oldDef.getCptVersion();
		
		/// Make max state the deterministic state
		let numParCombos = this.node.parents.reduce((a,p) => a * p.states.length, 1);
		let numStates = this.node.states.length;
		for (let r=0; r<numParCombos; r++) {
			let max = -Infinity;
			let maxI = 0;
			for (let i=0; i<numStates; i++) {
				if (cpt.cpt[r*numStates + i] > max) {
					maxI = i;
					max = cpt.cpt[r*numStates + i];
				}
				cpt.cpt[r*numStates + i] = 0;
			}
			cpt.cpt[r*numStates + maxI] = 1;
		}
		
		return cpt;
	}
	
	make(...args) {
		super.make(...args);
		this.rootEl.querySelector('.CDT').classList.add('CPT');
	}
	
	setCellBackground(td) {
		let isOn = td.querySelector('input').checked;
		
		if (isOn) {
			let n = td.closest('tr').rowIndex % 2;
			td.style.backgroundColor = "var(--cpt-background"+n+")";
		}
		else {
			td.style.backgroundColor = '';
		}
	}
	
	addStateEntry(tr, prob, pos = -1) {
		let td = n('td',
			n('input.toState', {type: 'radio', name: 'row'+tr.rowIndex, checked: prob==1 ? true : null}),
		);
		if (pos == -1) {
			tr.appendChild(td);
		}
		else {
			tr.cells[pos].after(td);
		}
		this.setCellBackground(td);
	}
	
	addEvents(rootEl) {
		rootEl = rootEl.querySelector('.CDT');
		
		rootEl.addEventListener("input", event => {
			let el = null;
			if ( (el=event.target.closest('input')) ) {
				el.closest('tr').querySelectorAll('td').forEach(td => this.setCellBackground(td));
				/// This row was possibly set to invalid. Clear, if any change made
				el.closest("tr").classList.remove("invalid");
			}
			else if ( (el=event.target.closest('th span')) ) {
				el.setAttribute('title', el.textContent);
				let states = [...el.closest('tr').querySelectorAll('.stateId')].map(el => ({id: el.textContent}));
				this.updateLinkedObjects({states});
			}
		}, true);
		rootEl.addEventListener("click", event => {
			let el = null;
			if ( (el=event.target.closest('td')) ) {
				el.querySelector('input').checked = true;
				el.closest('tr').querySelectorAll('td').forEach(td => this.setCellBackground(td));
				/// This row was possibly set to invalid. Clear, if any change made
				el.closest("tr").classList.remove("invalid");
			}
		}, true);
		rootEl.addEventListener('focus', event => {
			let el = null;
			if ( (el=event.target.closest('*[contenteditable]')) ) {
				this.probFocused = event.target;
				selectContents(el);
			}
		}, true);
		this.addSelectEvents(rootEl);
	}

	handleObjectUpdate(m, updateId = null) {
		super.handleObjectUpdate(m, updateId);
		/*if (m.def && this.rootEl.matches('.definitionMade')) {
			/// Definition will be kept up to date by the context menu (since we can't
			/// track a change in the pointer here)
			this.make();
		}*/
	}
	
	getDefinitionUpdateMessage() {
		let m = {};
		
		let numStates = this.rootEl.querySelectorAll('.CDT .stateLabel').length;
		let probs = [...this.rootEl.querySelectorAll('.CDT input')].map(el => Number(el.checked));
		let numRows = probs.length/numStates;
		
		/// If the CPT table exists, put it into the message
		if (numStates) {
			/*let firstRowI = this.rootEl.querySelector('tr.thisNodeStates').rowIndex+1;
			for (let r=0; r<numRows; r++) {
				let sum = 0;
				for (let c=0; c<numStates; c++) {
					//console.log(r, c, nodeDup.states.length, r*nodeDup.states.length + c);
					sum += probs[r*numStates + c];
				}
				//console.log(r, sum, newCpt, nodeDup.states, nodeDup.def.cpt, node.def.cpt);
				if (Math.round(sum*1000) != 1000) {
					m.invalid = 'Row does not sum to 1';
					this.rootEl.querySelector(`.cpt tr:nth-child(${firstRowI + r + 1})`).classList.add("invalid");
				}
			}*/
			
			let cdt = [];
			for (let i=0; i<numRows; i++) {
				for (let j=0; j<numStates; j++) {
					if (probs[i*numStates + j]==1) {
						cdt.push(j);
						break;
					}
				}
			}
			
			m.funcTable = cdt;
			console.log(m);
		}
		
		return m;
	}
	
}

Equation.Editor = class extends Definition.Editor {
	constructor(...args) {
		super(...args);
	}
	
	setType() { this.type = 'Equation'; }
	
	getDefVersion(oldDef) {
		return oldDef.getEquationVersion() || new Equation(null,`${this.node.id} = Or(${
			this.node.parents.map(p=>p.id).join(',')
		})`);
	}
	
	make(o = {}) {
		let currentCode = (this.editor && this.editor.getCode()) || this.def.funcText;
		console.log(this.def, this.def.funcText);
		this.rootEl.innerHTML = '';
		let edit = n('div.equationText');
		this.rootEl.append(edit);
		this.editor = new CodeFlask(edit, {language: 'js'});
		let code = currentCode.replace(new RegExp('^(\\s*)'+IDREGEX.source+'\\b'), '$1'+this.node.id);
		this.editor.updateCode(code);
	}
	
	handleObjectUpdate(m, updateId = null) {
		if (this.rootEl.matches('.definitionMade')) {
			if (m.def || m.id) {
				this.make();
			}
		}
	}
	
	getDefinitionUpdateMessage() {
		let msg = {};
		
		//let funcText = this.rootEl.querySelector('.equationText').value;
		let funcText = this.editor.getCode();
		msg.funcText = funcText;
		
		return msg;
	}
}

NoisyOrDef.Editor = class extends Definition.Editor {
	constructor(...args) {
		super(...args);
	}
	
	setType() { this.type = 'NoisyOr'; }
	
	getDefVersion(oldDef) {
		if (oldDef.type == 'NoisyOr')  return oldDef;
		
		let cpt = oldDef.getCptVersion();
		
		/// Convert CPT to Noisy OR
		/// XXX TBD
		
		return new NoisyOrDef(this.node);
	}
	
	make(o = {}) {
		let {thisState, parentStates} = this.def.matchingStates ? this.def.matchingStates : {thisState: 0, parentStates: []};
		let noisyOrEl = n('div.noisyOr',
			n('div',
				this.node.id, ' is ', n('select', this.node.states.map(
					(s,i) => n('option', {value: i, selected: thisState==i ? 'selected' : null}, s.id))
				),
				' with:',
			),
		);
		
		let i = 0;
		for (let parent of this.node.parents) {
			noisyOrEl.append(
				n('div.operand',
					'p = ',
					n('span',
						n('input', {value: this.def.noisyArgs[i*2 + 1]}),
					),
					' when ',
					n('span', parent.id),
					' is ',
					n('span',
						n('select',
							parent.states.map(
								(s,j) => n('option', {value: j, selected: parentStates[i]==j ? 'selected' : null}, s.id)
							),
						),
					),
				),
			);
			i++;
		}
		
		noisyOrEl.append(
			n('div.leak',
				n('span', ' p = '),
				n('input', {value: this.def.noisyArgs[this.node.parents.length*2]}),
				' when no parent active '
			),
		);
		
		this.rootEl.innerHTML = '';
		this.rootEl.append(noisyOrEl);
	}
	
	handleObjectUpdate(m, updateId = null) {
		if (this.rootEl.matches('.definitionMade')) {
			if (m.def) {
				this.make();
			}
		}
	}
	
	getDefinitionUpdateMessage() {
		let noisyArgs = [];
		let [thisState, ...parentStates] = [...this.rootEl.querySelectorAll('select')].map(s => s.value);
		this.rootEl.querySelectorAll('.operand input').forEach(p => noisyArgs.push(1, p.value));
		noisyArgs.push(this.rootEl.querySelector('.leak input').value);
		return {noisyArgs, matchingStates: {thisState, parentStates}};
	}
}

WeightedSum.Editor = class extends Definition.Editor {
	constructor(...args) {
		super(...args);
	}
	
	setType() { this.type = 'WeightedSum'; }
	
	getDefVersion(oldDef) {
		if (oldDef.type == 'WeightedSum')  return oldDef;
		
		let cptDef = oldDef.getCptVersion();
		
		/// Convert CPT to WeightedSum
		/// XXX Mostly TBD
		
		return new WeightedSum(this.node,
			/*top:*/cptDef.getRow(0), /*bottom:*/cptDef.getRow(cptDef.getNumRows()-1)
		);
	}
	
	make(o = {}) {
		let {top: topRow, bottom: bottomRow, parentWeights} = this.def;
		let weightedSumDiv = n('div.weightedSum',
			n('div.topRow',
				n('label', 'Top Row:'),
				n('input', {name:'top', value: topRow.join(',')})
			),
			n('div.bottomRow',
				n('label', 'Bottom Row:'),
				n('input', {name:'bottom', value: bottomRow.join(',')})
			),
			this.node.parents.map((p,i) => 
				n('div.parentWeight',
					n('label', p.id, ':'),
					n('input', {value:parentWeights[i]}),
				)
			),
		);
		
		this.rootEl.innerHTML = "";
		this.rootEl.append(weightedSumDiv);
	}
	
	handleObjectUpdate(m, updateId = null) {
		if (this.rootEl.matches('.definitionMade')) {
			if (m.def) {
				this.make();
			}
		}
	}
	
	getDefinitionUpdateMessage() {
		let top = this.rootEl.querySelector('[name=top]').value.split(/,/).map(v => Number(v));
		let bottom = this.rootEl.querySelector('[name=bottom]').value.split(/,/).map(v => Number(v));
		let parentWeights = [...this.rootEl.querySelectorAll('.parentWeight input')].map(el => Number(el.value));
		return {top, bottom, parentWeights};
	}
}


var app = {
	/// The currently focused "window"
	windowFocus: null,
	/// The clipboard is inherently a global thing, but maybe some of the copy/paste
	/// actions can be moved into the BN
	clipboard: {
		items: [],
		cut(items = null) {
			let bn = currentBn;
			app.clipboard.items = bn.copy(items);
			bn.changes.startCombined();
			for (let item of bn.selected) {
				item.guiDelete();
			}
			bn.changes.endCombined();
			bn.guiUpdateAndDisplayForLast();
		},
		copy(items = null) {
			/// If CPT is visible with selected cells, don't copy
			/// XXX This shouldn't be here. Need better exclusion mechanism
			if (!$('.CPT .selected').length) {
				let bn = currentBn;
				app.clipboard.items = bn.copy(items);
			}
		},
		/// loc = {x: <num>, y: <num>}
		paste(loc = null) {
			let bn = currentBn;
			let offset = {x: 10, y: 10};
			let addedItems = [];
			let idMap = {};
			let newIds = new Set();
			bn.changes.startCombined();
			for (let item of this.items) {
				let dupItem = item.duplicate();
				dupItem.renameToUnique({idExists(possId) {
					/// Can't use ID if 1) already in BN, 2) a child of this item has the ID, or 3) another duplicate has already used the ID
					let hasId = bn.find(possId) || (dupItem.find && dupItem.find(possId)) || newIds.has(possId);
					return hasId;
				}});
				//dupItem.renameToUnique({net:bn});
				idMap[item.id] = dupItem;
				/// Keep track of the new IDs we're creating, so we don't
				/// double up
				newIds.add(dupItem.id);
				if (dupItem.getAllItems) {
					for (let item of dupItem.getAllItems()) {
						newIds.add(item.id);
					}
				}
				if (offset) {
					dupItem.pos.x += offset.x;
					dupItem.pos.y += offset.y;
				}
				addedItems.push(dupItem);
			}
			for (let dupItem of addedItems) {
				if (dupItem.parents) {
					/// Update parents and children. Drop children that are outside the copy.
					for (let [i,child] of dupItem.children.entries()) {
						if (child.id in idMap) {
							dupItem.children[i] = idMap[child.id];
						}
						else {
							dupItem.children[i] = null;
						}
					}
					dupItem.children = dupItem.children.filter(c => c!==null);
					for (let [i,parent] of dupItem.parents.entries()) {
						if (parent.id in idMap) {
							dupItem.parents[i] = idMap[parent.id];
						}
					}
				}
			}
			for (let dupItem of addedItems) {
				if (dupItem.guiAddToNet) {
					dupItem.guiAddToNet(bn);
				}
			}
			/// Wire up the added items correctly
			/*for (let [i,item] of addedItems.entries()) {
				if (item.parents) {
					item.guiAddParents(this.items[i].parents.map(p => idMap[p.id] || p.id));
					item.guiAddChildren(this.items[i].children.map(c => idMap[c.id] || null).filter(c => c!==null));
				}
			}*/
			//bn.updateArcs(addedItems);
			bn.selected.forEach(item => item.guiToggleSelect());
			addedItems.forEach(item => item.guiToggleSelect());
			bn.changes.endCombined();
			bn.guiUpdateAndDisplayForLast();
		},
		delete() {
			currentBn.changes.startCombined();
			for (var item of currentBn.selected) {
				item.guiDelete();
				currentBn.selected.delete(item);
			}
			currentBn.changes.endCombined();
			currentBn.guiUpdateAndDisplayForLast();
		},
	},
	setTheme(theme) {
		if (theme == "null")  theme = null;
		document.querySelectorAll(`style[data-style]`).forEach(s => s.disabled = true);
		let q = document.querySelector(`style[data-style=${theme}]`);
		if (q)  q.disabled = false;
		localStorage.setItem('theme', theme);
		q = document.querySelector(`[name=menuTheme][value="${theme ? theme : ''}"]`)
		if (q)  q.checked = true;
		currentBn?.redrawAllArcs?.();
	},
	newFile() {
		window.open(String(location).slice(0,-location.search.length || undefined));
	},
	closeFile() {
		window.history.pushState({}, '', changeQsUrl(window.location.href, {file: null}));
		let bn = new BN({filename: `bn${++guiBnCount}.xdsl`});
		app.openBn(bn);
		currentBn.display();
	},
	openBn(bn) {
		openBns.push(bn);
		/** XXX Add window mgmt */
		document.querySelectorAll('.bnouterview > :not(.bnmidview)').forEach(el => el.remove());
		currentBn = bn;
		currentBn.clearSidebar();
		$('.bnComponent').data('bn', currentBn);
		/// The first lastSave is always 0
		let lastSave = 0;
		currentBn.changes.undoListeners.push(event => {
			/// If we added to the UndoList, we will destroy all undo entries that
			/// were in the future, including the 'lastSave' if that was in the future.
			/// So set lastSave to invalid state
			if (event.type == 'add' && event.undoList.index <= lastSave) {
				lastSave = -1;
			}
			
			/// There's unsaved changes if the undo doesn't coincide with the last save
			let unsavedChanges = true;
			if (event.undoList.index == lastSave) {
				unsavedChanges = false;
			}
			currentBn.setUnsavedChanges(unsavedChanges);
		});
		
		/// (When saving happens, update lastSave)
		currentBn.saveListeners.push(event => {
			lastSave = currentBn.changes.index;
			currentBn.setUnsavedChanges(false);
		});
	},
	loadFile: async function() {
		if (stormy.available) {
			var file = await stormy.openFileDialog();
			let app = this;
			let bn = new BN({source: file.text, outputEl: $(".bnview"), format: file.format, fileName: file.fileName, onload() { app.updateBN()}});
			this.openBn(bn);
			currentBn._stormyKey = file.key;
			//this.updateBN();
			/// XXX Once loadFile rewritten, move this after it
			window.history.pushState({}, '', changeQsUrl(window.location.href, {file: null}));
		}
		else {
			$("#openFile").click();
		}
	},
	/**
		@file: a file object, from (e.g.) an <input> or a |event.dataTransfer.files| object
	*/
	fileLoaded(file, callback) {
		var fileName = baseName(file.name);
		let format = getFileType(fileName);
		/*var format = file.name.replace(/^.*\.([^.]*)$/, '$1');
		/// Assume xdsl if extension not recognised (XXX probably should at least throw a warning before
		/// the inevitable failure to load anything)
		console.log(format);
		if (!FILE_EXTENSIONS[format]) {
			format = "xdsl";
		}*/
		let fileExtInfo = getFileTypeInfo(format); //FILE_EXTENSIONS[format];

		//onsole.debug(file);
		var reader = new FileReader();
		reader.onload = function(e) {
			let bn = new BN({source: e.target.result, outputEl: $(".bnview"), format: format, fileName: fileName, onload: callback});
			app.openBn(bn);
		}
		/// Handle binary differently to text
		if (fileExtInfo.text) {
			reader.readAsText(file);
		}
		else {
			reader.readAsArrayBuffer(file);
		}
	},
	tempButton(func) {
		let button = n('button', {style: 'position: fixed; z-index: 100000; left: 50%; top: 50%;', on: {click: event => {
			func();
			button.remove();
		}}}, 'CLICK');
		document.body.append(button);
	},
	async openAndReadFile() {
		return await new Promise((res,rej) => {
			let fileInput = n('input', {type: 'file', style:'display:none;', on: {change: async event => {
				let file = event.target.files[0];
				let reader = new FileReader();
				reader.onload = function(e) {
					res(e.target.result);
				};
				reader.readAsText(file);
			}}});
			document.body.append(fileInput);
			fileInput.click();
		});
	},
	readChosenFile(inp, callback) {
		var file = inp.files[0];
		console.debug(file);
		var reader = new FileReader();
		reader.onload = function(e) {
			if (callback)  callback(e.target.result, file.name, e);
		}
		reader.readAsText(file);
	},
	loadData(text, o = {}) {
		o.fileName = o.fileName || null;
		
		let sep = /\t/;
		
		if (o.fileName && !o.type) {
			if (o.fileName.endsWith('.csv')) {
				o.type = 'csv';
			}
		}
		
		if (o.type == 'csv') {
			sep = /\s*,\s*/;
		}
		
		openData.push(readCsv(text, {sep}));
		
		app.updateDataMenus({add: {fileName: o.fileName, index: openData.length-1}});
	},
	updateDataMenus(o = {}) {
		console.log('x');
		o.add ??= null;
		
		if (o.add) {
			$('.reparameterizeMenu .itemList').append(
				MenuAction(o.add.fileName, _=> { app.autoReparameterize(o.add.index); dismissActiveMenus(); }).make(),
			);
		}
	},
	saveFile: function(type = 'xdsl') {
		if (stormy.available && currentBn._stormyKey) {
			stormy.saveFile(currentBn._stormyKey, currentBn['save_'+type]());
			currentBn.runSaveListeners({type: 'save', complete: true});
		}
		else {
			this.saveAsFile(type);
		}
	},
	saveAsFile: async function(type = 'xdsl') {
		if (false && stormy.available) {
			var file = await stormy.saveFileDialog();
			stormy.saveFile(file.key, currentBn['save_'+type]());
			currentBn.runSaveListeners({type: 'saveAs', complete: true});
		}
		else {
			/// XXX This seems more robust than what I was doing below
			/// But not sure if that's really the case, since below was very
			/// randomly flaky
			function save(filename, data) {
				var blob = new Blob([data], {type: 'application/octet-stream'});
				if(window.navigator.msSaveOrOpenBlob) {
					window.navigator.msSaveBlob(blob, filename);
				}
				else{
					var elem = window.document.createElement('a');
					elem.style.display = 'none';
					elem.href = window.URL.createObjectURL(blob);
					elem.download = filename;        
					document.body.appendChild(elem);
					elem.click();
					setTimeout(_=>document.body.removeChild(elem), 60*1000);
				}
			}
			save(
				currentBn.fileName.replace(/\.\w*$/, '.'+type),
				currentBn['save_'+type]()
			);
				
			/*let a = $('#downloadFrame')[0].contentDocument.querySelector('a');

			$(a)
				.attr('href', 'data:text/plain;base64,'+window.btoa(currentBn['save_'+type]()))
				.attr('download', currentBn.fileName.replace(/\.\w*$/, '.'+type));
			a.click();*/
			
			/// No way to tell if the user actually goes through with the save :(
			currentBn.runSaveListeners({type: 'saveAs', complete: false});
		}
	},
	updateBN(callback) {
		currentBn.updateAndDisplayBeliefs(null, callback);
	},
	updateBn(callback) {
		this.updateBN(callback);
	},
	async findGoodDecisions() {
		if (!currentBn._decisionNodes.length) {
			popupDialog("<p>This network has no decision nodes.<div class=controls><button type=button class=okButton>OK</button></div>");
			$(".dialog .okButton").one("click", dismissDialogs);
			return;
		}
		var str = "";
		var dec;
		if (numNodeStateCombinations(currentBn._decisionNodes) < 100) {
			dec = await currentBn.searchDecisionsAll();
		}
		else {
			str += "<strong>Too many decision combinations. Using decision order instead.</strong>";
			dec = await currentBn.searchDecisionsOrdered();
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
		$('.evidenceMenu .itemList').append(
			this.makeEvidenceMenuItem(evNum, evCopy)
		);
	},
	makeEvidenceSummaryShort(evidence) {
		let str = Object.keys(evidence).map(e => `${e}=${currentBn.node[e].states[evidence[e]].id}`).join(', ');
		//str = str.length > 20 ? str.slice(0, 17)+'...' : str;
		return str || 'Marginals*';
	},
	makeEvidenceSummaryLong(evidence) {
		let str = '';
		let sep = '';
		for (let [nm,ev] of Object.entries(evidence)) {
			str += `${sep}${nm}=${currentBn.node[nm].states[ev].id}`;
			sep = '\n';
		}
		return str || 'No evidence set';
	},
	makeEvidenceMenuItem: function(evNum, evidence) {
		let remove = function(event) {
			console.log('x');
			let restore = event.target.closest('.restore');
			var evNum = restore.dataset.evidenceSet;
			currentBn.evidenceSets.splice(evNum, 1);
			restore.closest('.menuAction').remove();
			$('.evidenceSetHighlight').removeClass('evidenceSetHighlight');
			event.stopPropagation();
		}
		/// XXX NYI
		let compare = function(event) {
			let restore = event.target.closest('.restore');
			/// 1 comparison evidence set
			let savedEv = Object.assign({}, currentBn.evidence);
			//currentBn.evidence = 
			currentBn.evidenceSets.comparison = evidence;
			currentBn.evidence = savedEv;
			event.stopPropagation();
		}
		let evShort = this.makeEvidenceSummaryShort(evidence);
		let evLong = this.makeEvidenceSummaryLong(evidence);
		var ma = MenuAction(n('div.restore', {title: evLong, dataEvidenceSet: evNum},
			n('span.label', `${evShort}`),
			n('span.controls',
				//n('span.compare', 'c', {on: {click: compare}}),
				n('span.delete', 'x', {on: {click: remove}}),
			),
			{on: {
				mouseover: _=> {
					for (let [nodeName,val] of Object.entries(evidence)) {
						currentBn.node[nodeName].el().addClass('evidenceSetHighlight');
					}
				},
				mouseout: _=> {
					$('.evidenceSetHighlight').removeClass('evidenceSetHighlight');
				},
			}}
		), function() {
			currentBn.setEvidence(evidence, {reset:true});
		}, {type: 'evidenceItem'});
		
		let item = ma.make();
		return item;
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
	updateBnName(bn = currentBn) {
		document.title = (bn.unsavedChanges ? '* ' : '') + bn.fileName + " - " + titlePostfix;
		$('.menu.bar .bnName').val(bn.fileName.replace(/^(.*)\..*?$/, '$1'));	
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
	setUpdateMethod(method, useWorkers, menuEl = null) {
		if (menuEl) {
			let $menuAction = $(menuEl.closest('.menuAction'));
			$menuAction.parent().find('.checked').removeClass('checked');
			$menuAction.addClass('checked');
		}
		currentBn.setUseWorkers(useWorkers).setUpdateMethod(method);
		currentBn.updateAndDisplayBeliefs();
		Object.assign(mbConfig, {
			updateMethod: method,
			useWorkers,
		});
	},
	insertSpace(direction) {
		let clientY = 'clientY';
		let top = 'top';
		let y = 'y';
		
		/// Only used for rectangular
		let clientX = 'clientX';
		let left = 'left';
		let x = 'x';
		if (direction == 'rectangular') {
			
		}
		else if (direction == 'vertical') {
			clientY = 'clientX';
			top = 'left';
			y = 'x';
		}
		
		let currentSubItems = currentBn.getCurrentSubmodel().getItems();
		let protect = null
		document.body.append(protect = n('div.insertSpaceProtector.'+direction));
		let bnViewRect = $('.bnview')[0].getBoundingClientRect();
		protect.style.top = bnViewRect.top+'px';
		protect.style.left = bnViewRect.left+'px';
		protect.style.width = bnViewRect.width+'px';
		protect.style.height = bnViewRect.height +'px';
		protect.addEventListener('mousedown', event => {
			console.log('mousedown');
			/// Find all nodes below the click point
			let origClientY = event[clientY];
			let bnDividePos = event[clientY] - bnViewRect[top];
			let belowNodes = currentSubItems.filter(n => n.pos[y] > bnDividePos);
			/// We'll cheat and use node order
			let belowYs = belowNodes.map(n => n.pos[y]);
			//belowNodes.forEach(n => n.guiToggleSelect(true));

			/// All nodes to the right of the click node
			let origClientX = event[clientX];
			let bnDividePosX = event[clientX] - bnViewRect[left];
			let rightNodes = currentSubItems.filter(n => n.pos[x] > bnDividePosX);
			/// We'll cheat and use node order
			let rightXs = rightNodes.map(n => n.pos[x]);
			//rightNodes.forEach(n => n.guiToggleSelect(true));
			
			let mousemove, mouseup;
			document.body.addEventListener('mousemove', mousemove = event => {
				let deltaX = event[clientX] - origClientX;
				let deltaY = event[clientY] - origClientY;
				for (let i=0; i<belowNodes.length; i++) {
					let node = belowNodes[i];
					if (direction == 'horizontal' || direction == 'rectangular') {
						node.moveTo(node.pos.x, belowYs[i] + deltaY, false);
					}
					else {
						node.moveTo(belowYs[i] + deltaY, node.pos.y, false);
					}
				}
				if (direction == 'rectangular') {
					for (let i=0; i<rightNodes.length; i++) {
						let node = rightNodes[i];
						node.moveTo(rightXs[i] + deltaX, node.pos.y, false);
					}
				}
			});
			document.body.addEventListener('mouseup', mouseup = event => {
				currentBn.changes.doCombined(_=> {
					for (let i=0; i<belowNodes.length; i++) {
						let node = belowNodes[i];
						let newY = node.pos[y];
						if (direction == 'horizontal' || direction == 'rectangular') {
							/// apiMoveTo is only here to reset to the right state for the undo
							node.apiMoveTo(node.pos.x,belowYs[i]);
							node.moveTo(node.pos.x,newY);
						}
						else {
							node.apiMoveTo(belowYs[i],node.pos.y);
							node.moveTo(newY,node.pos.y);
						}
					}
					if (direction == 'rectangular') {
						for (let i=0; i<rightNodes.length; i++) {
							let node = rightNodes[i];
							let newX = node.pos[x];
							node.apiMoveTo(rightXs[i],node.pos.y);
							node.moveTo(newX,node.pos.y);
						}
					}
				});
				document.body.removeEventListener('mousemove', mousemove);
				document.body.removeEventListener('mouseup', mouseup);
				protect.remove();
			});
		});
	},
	autoLayout: function(callback, o = {}) {
		o.direction = o.direction || 'TB';
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

		g.graph().rankdir = o.direction;
		dagre.layout(g);

		/// Store the endpoints for all arcs
		var startArcPositions = {};
		$('.dependency').each(function() {
			var arr = $(this).attr('d').replace(/[a-zA-Z]/g, '').replace(/^\s+|\s+$/g, '').split(/\s+/);
			for (var i=0; i<arr.length; i++)  arr[i] = parseFloat(arr[i]);
			startArcPositions[$(this).attr("id")] = arr;
		});
		console.log("startArcPositions", startArcPositions);
		
		/// Existing prevailing direction
		let sumX = 0; countX = 0;
		let sumY = 0; countY = 0;
		for (let item of graphItems) {
			if (item.children)  for (let child of item.children) {
				sumX += child.pos.x - item.pos.x; countX++;
				sumY += child.pos.y - item.pos.y; countY++;
			}
		}
		let existing = 'TB';
		if (Math.abs(sumX/countX) > Math.abs(sumY/countY)) {
			existing = 'LR';
		}
		let swapXYWidthHeight = existing != o.direction;
		
		function getXYBounds(xys) {
			let xs = xys.map(xy => xy.x);
			let ys = xys.map(xy => xy.y);
			let bounds = {minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys)};
			bounds.width = bounds.maxX - bounds.minX;
			bounds.height = bounds.maxY - bounds.minY;
			return bounds;
		}
		let origXYBounds = getXYBounds(graphItems.map(n => n.pos));
		let autoXYBounds = getXYBounds(g.nodes().map(nId => g.node(nId)));
		/// Original needs to at least not be tiny (auto is quite compact)
		if (origXYBounds.width >= autoXYBounds.width && origXYBounds.height >= autoXYBounds.height) {
			let aspectRatio = 1.4; /// Adjust for the fact that nodes tend to take up more horizontal space...
			if (swapXYWidthHeight) {
				let t = origXYBounds.width/aspectRatio;
				origXYBounds.width = origXYBounds.height*aspectRatio;
				origXYBounds.height = t;
			}
			
			{
				let o = origXYBounds, a = autoXYBounds;
				let xAdjust = x => (x-a.minX)/(a.width)*(o.width)+o.minX;
				let yAdjust = y => (y-a.minY)/(a.height)*(o.height)+o.minY;
				g.nodes().forEach(nId => {
					let p = g.node(nId);
					p.x = xAdjust(p.x); p.y = yAdjust(p.y);
					//p.x += 100;
				});
			}
		}

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
			//onsole.log(progress, propProgress);
			var vecLength = 4;
			for (var i in startArcPositions) {
				var mixPosition = newArray(vecLength, 0);
				for (var j=0; j<vecLength; j++) {
					mixPosition[j] = propProgress*endArcPositions[i][j] + (1-propProgress)*startArcPositions[i][j];
				}
				$('#'+i).attr('d', 'M '+mixPosition[0]+' '+mixPosition[1]+' L '+mixPosition[2]+' '+mixPosition[3]);
				$('#'+i).data('clickable').attr('d', 'M '+mixPosition[0]+' '+mixPosition[1]+' L '+mixPosition[2]+' '+mixPosition[3]);
			}
			if (progress < duration) {
				requestAnimationFrame(step);
			}
			else {
				currentBn.resizeCanvasToFit();
				setTimeout(_=>currentBn.resizeCanvasToFit(),300);
				if (callback)  callback();
			}
		});

		/** End duplication warning. **/

		/*currentBn.display();
		currentBn.displayBeliefs();*/
	},
	/** Change the (NYI: selected) nodes to display as labels or distributions. This requires a relayout of BN. **/
	changeNodeView: function(type) {
		currentBn.setNodeView(type);
		currentBn.redrawAllArcs();
		currentBn.resizeCanvasToFit();
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
	highlightOnSelection(type) {
		currentBn.showRelationType = type;
		currentBn.showRelationHighlightMode = 'opacity';
		/// XXX: Hmmm, should call something more direct
		if (!type)  currentBn.updateShowRelated({forceClear:true});
		currentBn.notifySelectionChanged();
		$(`.highlightOnSelection`).prop('checked', false);
		$(`.highlightOnSelection.${type??'none'}`).prop('checked', true);
	},
	addNodesFromFile() {
		$('#openDataFile').one('change', function() {
			app.readChosenFile(this, function(fileData, fileName) {
				app.loadData(fileData, {fileName});
				currentBn.addNodes(openData[openData.length-1]);
				currentBn.display();
				currentBn.compile();
				app.updateBN(_=>app.autoLayout());
			});
		}).click();
	},
	learnParametersCounting: function() {
		$('#openDataFile').one('change', function() {
			app.readChosenFile(this, function(fileData, fileName) {
				app.loadData(fileData, {fileName});
				currentBn.learnParametersCounting(openData[openData.length-1]);
				app.updateBN();
			});
		}).click();
	},
	learnParametersEm: function() {
		$('#openDataFile').one('change', function() {
			app.readChosenFile(this, function(fileData, fileName) {
				app.loadData(fileData, {fileName});
				currentBn.learnParametersEm(openData[openData.length-1]).then(() => app.updateBN());
			});
		}).click();
	},
	learnStructureWithClass: function(method = {func: 'NaiveBayes', name: 'Naive Bayes'}) {
		$('#openDataFile').one('change', function() {
			app.readChosenFile(this, function(fileData, fileName) {
				app.loadData(fileData, {fileName});
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
						app.openBn(new BN());
					}
					currentBn['learnStructure'+method.func](data, classNode);
					currentBn.display();
					currentBn.compile();
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
	autoReparameterize(index = null) {
		let func = null;
		index ??= openData.length-1;
		currentBn.addListener('structureChange', func = _=> {
			console.log('xxxxxxxxxxx');
			console.time('learn');
			currentBn.learnParametersCounting(openData[index]);
			console.timeEnd('learn');
			currentBn.updateAndDisplayBeliefs();
		});
		func();
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
	compareNetwork() {
		$('#openDataFile').one('change', function() {
			app.readChosenFile(this, function(fileData, fileName) {
				let compareBn = new BN({source: fileData, fileName});
				window.compareBn = compareBn;
				/// Try as an extension for now
				addMethodListener(currentBn, 'updateBeliefs', async _=> {
					console.log('HELLO?!');
					compareBn.evidence = pick(currentBn.evidence, ...compareBn.nodes.map(n=>n.id));
					console.log(compareBn.evidence);
					await new Promise(r => compareBn.updateBeliefs(r));
					/// Now update the view with the additional beliefs
					for (let thatNode of compareBn.nodes) {
						let thisNode = currentBn.node[thatNode.id];
						if (thisNode) {
							for (let [i,bel] of thatNode.beliefs.entries()) {
								let $stateEl = thisNode.el().find(`.stateName[data-index=${i}]`).parent();
								if (!$stateEl.find(`.beliefBar2`).length)  $stateEl.find('.beliefBarView').append(n('div.beliefBar2'));
								$stateEl.find('.beliefBar2').css('width', bel*100+'%');
							}
						}
					}
				});
				
				currentBn.updateAndDisplayBeliefs();
				
				/*app.loadData(fileData, {fileName});
				currentBn.addNodes(openData[openData.length-1]);
				currentBn.display();
				currentBn.compile();
				app.updateBN(_=>app.autoLayout());*/
			});
		}).click();
	},
	helpers: {
		stats: {
			name: 'Network Statistics',
			get rootEl() { return q('.sidebar .stats'); },
			init() {
				if (!this.rootEl) {
					let stats = n('div.stats',
						n('div.fields',
							n('div.field',
								n('label', '# Nodes:'),
								n('span.numNodes', ''),
							),
							n('div.field',
								n('label', '# CPT Parameters:'),
								n('span.numParams', ''),
							),
							n('div.field',
								n('label', 'Joint Distr. Size:'),
								n('span.jointSize', ''),
							),
						),
					);
					currentBn.addBoxToSidebar(stats, {title: 'Network Statistics', on_close: event => {
						currentBn.listeners.remove(this);
					}});
					currentBn.listeners.add(['structureChange definitionsChange',this], _=>this.updateView());
				}
				this.updateView();
			},
			updateView() {
				function makeExpNum(coeff, exp, o = {}) {
					o.nonSciUpperThresh ??= 7;
					o.orig ??= null;
					if (o.nonSciUpperThresh && exp < 7) {
						let num = 10**(Math.log10(coeff)+exp);
						if (exp>=0) {
							return n('span.exp.nonsci', Math.fround(num));
						}
						return n('span.exp.nonsci', num);
					}
					return n('span.exp', sigFig(coeff,3), '\u00d7', 10, n('sup', sigFig(exp, 3)));
				}
				let jointSize = currentBn.nodes.map(n=>Math.log10(n.states.length)).reduce((a,v) => a+v,0);
				let [jointNum,jointExp] = [jointSize-Math.floor(jointSize),Math.floor(jointSize)];
				let numParams = currentBn.nodes.map(n=>n.def.cpt?.length ?? 0).reduce((a,v)=>a+v,0);
				this.rootEl.q('.numNodes').textContent = Number(currentBn.nodes.length).toLocaleString();
				this.rootEl.q('.numParams').textContent = Number(numParams).toLocaleString();
				//this.rootEl.q('.jointSize').append(html(LatexToMathML(`${sigFig(10**jointNum,3)} \\times 10^{${jointExp}}`))); //jointSizeNumber().toLocaleString();
				this.rootEl.q('.jointSize').append(makeExpNum(10**jointNum,jointExp)); //jointSizeNumber().toLocaleString();
				/// Info from whatever engine is being used:
			},
		},
		compareCpts: {
			name: 'Compare CPTs',
			get rootEl() { return q('.sidebar .compareCpts'); },
			init() {
				if (!this.rootEl) {
					let cmp = n('div.compareCpts',
						n('style', `
							.klPopup { position: absolute;  background: white; border: solid 1px #ccc; padding: 3px; z-index: 10;
								max-width: 80%; }
							.ds_label h6 { position: relative; top: calc(-100% - 2px); text-shadow: 0 0 5px #fff, 0 0 5px #fff, 0 0 5px #fff;  }
							.legend .scale { height: 20px; width: 100%; }
							.legend .max { width: 100%; text-align: right; }
						`),
						n('div.fields',
							n('div.field',
								n('label', 'Compare to BN:'),
								n('input.fileCompare', {type:'file'}),
							),
							n('div.field.wide',
								n('div.legend',
									n('div.scale'),
									n('div.max'),
								),
							),
						),
					);
					currentBn.addBoxToSidebar(cmp, {title: 'Compare CPTs', on_close: event => {
						this.events.remove();
						q(currentBn).display().displayBeliefs();
					}});
					// currentBn.listeners.add(['structureChange definitionsChange',this], _=>this.updateView());
				}
				this.events = new ListenerGroup();
				this.eventHandlers();
				this.updateView();
			},
			cptKlDiv(cpt2d1, cpt2d2) {
				let kls = [];
				for (let i=0; i<cpt2d1.length; i++) {
					kls.push(klDiv(cpt2d1[i],cpt2d2[i]));
				}
				return kls;
			},
			makeGrad(kls, maxKl) {
				maxKl = Math.max(maxKl, 0.0001);
				let stops = [];
				for (let [i,kl] of kls.entries()) {
					stops.push(`hsl(230 50% ${sigFig(100-kl/maxKl*50,3)}%) ${i*100/kls.length}%`);
					stops.push(`hsl(230 50% ${sigFig(100-kl/maxKl*50,3)}%) ${(i+1)/kls.length*100}%`);
				}
				console.log(stops);
				return 'linear-gradient(to right, '+stops.join(', ')+')';
			},
			eventHandlers() {
				this.rootEl.listeners.add('dragover', event => false);
				this.rootEl.listeners.add('drop', event => {
					this.rootEl.q('.fileCompare').set({files: event.dataTransfer.files}).dispatchEvent(new Event('change'));
					event.stopPropagation();
					event.preventDefault();
				});
				let bn2 = null;
				this.rootEl.q('.fileCompare').listeners.add('change', async event => {
					let file = event.target;
					if (file.files.length) {
						let bn1 = currentBn;
						bn2 = new BN({source:await fileGetContents(file.files[0]), fileName: file.files[0].name});
						let allKls = {};
						let maxKl = 0;
						for (let node1 of bn1.nodes) {
							let node2 = bn2.node[node1.id];
							//console.log(node1.def.getCptVersion().get2d(), node2.def.getCptVersion().get2d());
							let kls = this.cptKlDiv(node1.def.getCptVersion().get2d(), node2.def.getCptVersion().get2d());
							maxKl = Math.max(maxKl, ...kls);
							allKls[node1.id] = kls;
							//console.log(kls);
							// node1.el().style.background = 'red';
						}
						this.rootEl.q('.legend .scale').style.background = 'linear-gradient(to right, white, hsl(230,50%,50%))';
						this.rootEl.q('.legend .max').textContent = sigFig(maxKl, 3);
						let klDivPopup = n('div.klPopup');
						for (let [id,kls] of Object.entries(allKls)) {
							let node = q(bn1.node[id].el());
							node.style.background = this.makeGrad(kls, maxKl);
							node.dataset.kls = JSON.stringify(kls.map(n => sigFig(n,3)));
							node.listeners.remove('.kls');
							this.events.add(node, 'mousemove.kls', event => {
								let el = event.target.closest('.node');
								let rect = el.getBoundingClientRect();
								let xPos = event.clientX - rect.x;
								let width = rect.width;
								let relPos = xPos/width;
								let kls = JSON.parse(el.dataset.kls);
								let rowI = Math.floor(relPos*kls.length);
								let kl = kls[rowI];
								let node1Cpt = currentBn.getItem(el).def.getCptVersion();
								let node2Cpt = bn2.getItem(el).def.getCptVersion()
								let node1Row = node1Cpt.getRow(rowI).map(v => sigFig(v,3));
								let node2Row = node2Cpt.getRow(rowI).map(v => sigFig(v,3));
								let rowName = JSON.stringify(node1Cpt.getNamedParentStatesMap(rowI)).slice(1,-1);
								q(klDivPopup).set({innerHTML:''}).append(
									n('div',rowName),
									n('div',kl),
									n('div',JSON.stringify(node1Row)),
									n('div',JSON.stringify(node2Row)),
								);
								popupElement(klDivPopup, q('.bnmidview').raw, event);
							}, {capture: true});
						}
						this.events.add(document, 'mousemove.kls', event => {
							if (!event.target.closest('.node')) {
								klDivPopup.remove();
							}
						});
					}
				});
			},
			updateView() {
			},
		},
		treatmentOutcome: {
			get rootEl() {
				return document.querySelector('.sidebar .treatmentOutcome');
			},
			get bnview() {
				return currentBn.el();
			},
			init() {
				/*if (!this.bnview.querySelector('.treatOutStyle')) {
				}*/
				let clearClasses = _=> {
					this.bnview.querySelectorAll('.treatOut-cause,.treatOut-effect,.treatOut-direct,.treatOut-backdoor,.treatOut-selectionBias').forEach(el => el.classList.remove('treatOut-cause','treatOut-effect','treatOut-direct','treatOut-backdoor','treatOut-selectionBias'));
				};
				let updateCauseEffect = _=> {
					let cause = this.rootEl.querySelector('.cause').value;
					let effect = this.rootEl.querySelector('.effect').value;
					let [causeNode,effectNode] = [currentBn.node[cause],currentBn.node[effect]];
					clearClasses();
					if (cause) {
						this.bnview.querySelector('.treatOut-cause')?.classList?.remove?.('treatOut-cause');
						currentBn.node[cause].el()[0].classList.add('treatOut-cause');
					}
					if (effect) {
						this.bnview.querySelector('.treatOut-effect')?.classList?.remove?.('treatOut-effect');
						currentBn.node[effect].el()[0].classList.add('treatOut-effect');
					}
					if (cause && effect) {
						//let arcs = currentBn.findAllDConnectedNodes4(currentBn.node[cause], currentBn.node[effect], {arcs:true});
						let backdoorArcs = causeNode.getBackdoorPaths([causeNode,effectNode]);
						let selectionBiasArcs = causeNode.getSelectionBias([causeNode,effectNode]);
						let directArcs = causeNode.getDirected([causeNode,effectNode],{arcs:true,blockOn:n=>n.hasEvidence()});
						this.bnview.querySelectorAll(directArcs.map(arc => `.arc-${arc}`).join(', ') || '#lfkasjdfl').forEach(el => $(el).data('clickable')[0].classList.add('treatOut-direct'));
						this.bnview.querySelectorAll(backdoorArcs.map(arc => `.arc-${arc}`).join(', ') || '#lfkasjdfl').forEach(el => $(el).data('clickable')[0].classList.add('treatOut-backdoor'));
						this.bnview.querySelectorAll(selectionBiasArcs.map(arc => `.arc-${arc}`).join(', ') || '#lfkasjdfl').forEach(el => $(el).data('clickable')[0].classList.add('treatOut-selectionBias'));
					}
				};
				currentBn.addListener('change', updateCauseEffect);
				if (!this.rootEl) {
					let el = n('div.treatmentOutcome',
						n('div.fields',
							n('div.field',
								n('label', 'Treatment:'), n('select.cause', {on:{input: updateCauseEffect}}), n('span.color.cause'),
							),
							n('div.field',
								n('label', 'Outcome:'), n('select.effect', {on:{input: updateCauseEffect}}), n('span.color.effect'),
							),
							n('div.field',
								n('label', 'Causal:'), n('span', '(auto)'), n('span.color.direct'),
							),
							n('div.field',
								n('label', 'Backpaths:'), n('span', '(auto)'), n('span.color.backpaths'),
							),
							n('div.field',
								n('label', 'Sel. bias:'), n('span', '(auto)'), n('span.color.selectionBias'),
							),
						),
					);
					currentBn.addBoxToSidebar(el, {title: 'Treatment-Outcome', onclose: _=> {
						currentBn.removeListener('change', updateCauseEffect);
						clearClasses();
					}});
					this.rootEl.append(n('style.treatOutStyle', `
						.node { background: var(--node-background) !important; color: var(--node-text) !important; }
						.node.hasEvidence { background: var(--node-evidence) !important; }
						.treatOut-cause { background: rgb(168,206,151) !important; }
						.treatOut-effect { background: rgb(140,161,216) !important; }
						path.treatOut-direct { stroke: #a8ce9777; }
						path.treatOut-backdoor { stroke: #f007; }
						path.treatOut-selectionBias { stroke: #f707; }
						.treatmentOutcome .fields { grid-template-columns: auto auto auto; width: fit-content; grid-auto-rows: 1fr; justify-items: center; gap: 3px; padding: 5px; }
						.treatmentOutcome .fields select { width: 100%; }
						.treatmentOutcome .fields .field > :nth-child(1) { justify-self: left; }
						.treatmentOutcome .color { width: 40px; height: 100%; position: relative; background: white; }
						.treatmentOutcome .color::before { position: absolute; width: 100%; height: 100%; content: ""; }
						.treatmentOutcome .color.cause::before { background: rgb(168,206,151); }
						.treatmentOutcome .color.effect::before { background: rgb(140,161,216); }
						.treatmentOutcome .color.direct::before { background: #a8ce9777; }
						.treatmentOutcome .color.backpaths::before { background: #f007; }
						.treatmentOutcome .color.selectionBias::before { background: #f707; }
					`));
					this.update();
				}
			},
			update() {
				let nodeIds = currentBn.nodes.map(n=>n.id);
				this.rootEl.querySelector('.cause').append(n('option',''),...nodeIds.map(id => n('option', id)));
				this.rootEl.querySelector('.effect').append(n('option',''),...nodeIds.map(id => n('option', id)));
			},
		},
		mi: {
			get rootEl() {
				return document.querySelector('.sidebar .miTable');
			},
			init() {
				if (!this.rootEl) {
					let changeEvent;
					currentBn.addListener('change', changeEvent = _=>setTimeout(_=>this.update(),100));
					currentBn.addBoxToSidebar(n('div.miTable',
						n('div.fields',
							n('div.field',
								n('label', 'Target:'), n('select.target', {on:{input: _=>this.update()}}),
							),
						),
						n('div.tablePar',
							n('table',
								n('thead', n('tr', n('th', 'Node'), n('th', 'MI%'))),
								n('tbody'),
							),
						),
					), {title: 'Sensitivity (Mutual Information)', onclose: _=>currentBn.removeListener('change', changeEvent)});
					this.rootEl.append(n('style.miStyle',`
						.sidebar .miTable .fields { padding: 5px; }
						.sidebar .miTable table { border-collapse: collapse; width: 100%; }
						.sidebar .miTable :is(th,td) { background: white; border: solid 1px #ccc; padding: 3px 6px; box-shadow: 0 0 0 1px #ccc; }
						.sidebar .miTable .miCell { background: linear-gradient(to right, #ccc, #ccc calc(var(--mipc)*100%), white calc(var(--mipc)*100%), white); }
						.sidebar .miTable .tablePar { max-height: 150px; overflow-y: auto; }
						.sidebar .miTable thead { position: sticky; top: 1px; }
					`));
				}
				this.update();
			},
			async update() {
				let nodeIds = currentBn.nodes.map(n=>n.id);
				let targetSel = this.rootEl.querySelector('.target');
				let table = this.rootEl.querySelector('.miTable table');
				let savedVal = targetSel.value;
				targetSel.innerHTML = '';
				targetSel.append(n('option',''),...nodeIds.map(id => n('option', id)));
				targetSel.value = savedVal;
				/// Clear the table (not header)
				table.querySelector('tbody').innerHTML = '';
				if (targetSel.value) {
					let miTable = await currentBn.calcMi(targetSel.value);
					let rows = Object.values(miTable);
					rows.sort((a,b) => b.miPc-a.miPc);
					table.querySelector('tbody').append(...rows.map(({node,mi,miPc}) => n('tr', n('td',node),n('td.miCell',{style:`--mipc:${miPc}`},`${Math.round(miPc*1000)/10}%`))));
				}
			},
		},
		finder: {
			get rootEl() {
				return document.querySelector('.sidebar .finder');
			},
			init() {
				if (!this.rootEl) {
					let changeEvent;
					let table = q(n('table'));
					let on_keyup = e => {
						if (e.key == 'Enter') {
							let rows = q(this.rootEl).qa('.tablePar table tbody tr');
							for (let row of rows) {
								currentBn.node[q(row).q('td.id').textContent].guiFlashIntoView();
							}
						}
						else if (e.key == 'Escape') {
							currentBn.closeSidebarBox(this.rootEl);
						}
					};
					currentBn.addListener('structureChange', changeEvent = _=>setTimeout(_=>this.update(),100));
					currentBn.addBoxToSidebar(n('div.finder',
						n('div.fields',
							n('div.field',
								n('label', ''), n('input.search', {on_input: _=>this.update(), on_keyup, placeholder: 'Search...'}),
								n('span',
									n('button.regexp.plain', '', {title: 'Regular Expression Search', on_click:e=>this.toggleOnOff(e)}),
									n('button.case.plain', '', {title: 'Case Sensitive Search', on_click:e=>this.toggleOnOff(e)}),
									n('button.sort.plain', '', {title: 'Sort Results', dataSort: 'original', on_click:e=>this.sortOptions(e)}),
								),
							),
						),
						n('div.tablePar',
							table.append(
								n('thead', n('tr', n('th', 'ID'), n('th', 'Label'))),
								n('tbody'),
							),
						),
					), {title: 'Find', class: 'findBox', onclose: _=>currentBn.removeListener('structureChange', changeEvent)});
					q('input.search').focus();
					this.rootEl.append(n('style.finderStyle',`
						.sidebar .findBox { flex: 1; display: flex; flex-direction: column; }
						.sidebar .finder { flex: 1; display: flex; flex-direction: column; }
						.sidebar .finder .fields { padding: 5px; grid-template-columns: auto 1fr auto; }
						.sidebar .finder table { border-collapse: collapse; width: 100%; table-layout: fixed; }
						.sidebar .finder :is(th,td) { background: white; border: solid 1px #ccc; padding: 3px 6px; box-shadow: 0 0 0 1px #ccc;
							overflow: hidden; text-overflow: ellipsis; }
						.sidebar .finder .miCell { background: linear-gradient(to right, #ccc, #ccc calc(var(--mipc)*100%), white calc(var(--mipc)*100%), white); }
						.sidebar .finder .tablePar { flex: 1; overflow-y: auto; }
						.sidebar .finder thead { position: sticky; top: 1px; }
						.sidebar .finder .search { width: 100%; }

						.sidebar .finder button.plain { border: 0; background: none; }
						.sidebar .finder button.plain:hover { background: #aaa; }
						.sidebar .finder button.plain.on { background: #777; color: white; }
						.sidebar .finder .regexp::before { content: '.*'; }
						.sidebar .finder .case::before { content: 'Aa'; }
						.sidebar .finder .sort::before { content: '↓↑'; }
						`),
						n('style.longIdLabel', '.sidebar .finder .tablePar td { font-size: 8pt; }'),
					);
				}
				this.update();
			},
			sortOptions(event) {
				let mAction = id => mEvent => { event.target.dataset.sort = id; this.update(); }
				let menu = Menu({type:'contextMenu', items: [
					['original', 'Original'],
					['idAZ', 'ID (A-Z)'],
					['idZA', 'ID (Z-A)'],
					['labelAZ', 'Label (A-Z)'],
					['labelZA', 'Label (Z-A)'],
					['rootsToLeaves', 'Roots-Leaves'],
					['leavesToRoots', 'Leaves-Roots'],
					['colorRootsToLeaves', 'Colour (Roots-Leaves)'],
					['colorLeavesToRoots', 'Colour (Leaves-Roots)'],
				].map(([id,label]) => MenuAction(label, mAction(id)))}).popup(event.target);
			},
			toggleOnOff(event) {
				let target = event.target;
				target.classList.toggle('on');
				this.update();
			},
			update() {
				let search = q('input.search').value;
				let table = q(this.rootEl).q('.tablePar table tbody');
				let regexp = q(this.rootEl).q('.regexp').classList.contains('on');
				let caseSense = q(this.rootEl).q('.case').classList.contains('on');
				let sortOrder = q(this.rootEl).q('.sort').dataset.sort;
				let toCase = caseSense ? s=>s : s=>s.toLowerCase();
				search = toCase(search);
				let pred = n => toCase(n.id).includes(search) || toCase(n.label).includes(search);
				let asRe = null;
				if (regexp) {
					try {
						asRe = new RegExp(search, caseSense ? '' : 'i');
					}
					/// If not valid RE, just return, don't change anything
					catch (e) {
						return;
					}
					pred = n => asRe.test(n.id) || asRe.test(n.label);
				}
				let foundNodes = currentBn.nodes.filter(pred);
				table.innerHTML = '';
				let showNode = el => currentBn.node[q(el).closest('tr').q('td.id').textContent].guiFlashIntoView();
				let hasLongId = false;
				let hasLongLabel = false;
				let sortedFoundNodes = BN.sortItems(foundNodes, sortOrder);
				for (let node of sortedFoundNodes) {
					hasLongId ||= node.id.length>15;
					hasLongLabel ||= node.label.length>15;
					table.append(n('tr', n('td.id', {
						on_click: e => showNode(e.target),
						style: `
							background: ${node.format.backgroundColor || 'var(--node-background)'};
							color: ${node.format.fontColor || 'var(--node-color)'};
						`}, 
						node.id), n('td', node.label)));
				}
				q('.sidebar .finder .longIdLabel').disabled = !hasLongId && !hasLongLabel;
			},
		},
		varDict: {
			init() {
				let updateField = (el, field) => {
					let nodeId = el.closest('tr').querySelector('td.id').textContent;
					document.querySelector('.bnmidview').style.display = 'block';
					currentBn.node[nodeId].updateObject({[field]: el.textContent});
					document.querySelector('.bnmidview').style.display = '';
				};
				let updateId = (el, field) => {
					let nodeId = el.closest('tr').dataset.nodeId;
					let newValue = el.textContent;
					document.querySelector('.bnmidview').style.display = 'block';
					currentBn.node[nodeId].updateObject({id: newValue});
					document.querySelector('.bnmidview').style.display = '';
					el.closest('tr').dataset.nodeId = newValue;
				};
				let copyTable = el => {
					copyHtmlToClipboard(el.outerHTML);
				};
				let table = q(n('table'));
				let varDict = n('div.varDict',
					n('style', `
						.bnmidview { display: none; }
						td:is(:nth-child(1),:nth-child(2),:nth-child(3)):hover:not(:focus) { outline: solid 2px #aaa; }
					`),
					n('div.titlebar',
						n('h2', 'Variable Dictionary'),
						n('button', 'X', {on_click: _=>varDict.remove()}),
					),
					n('div.controls',
						n('button', 'Copy Table', {on_click: e=>copyTable(table)}),
						this.sortButton(table, currentBn),
					),
					table.append(
						n('thead',
							n('tr',
								n('th', 'Node ID'),
								n('th', 'Node Label'),
								n('th', 'Description'),
								n('th', 'States'),
								n('th', 'Parents'),
							),
						),
						n('tbody',
							currentBn.nodes.map(node => n('tr', {dataNodeId: node.id},
								n('td.id', {style: `background: ${node.format.backgroundColor ?? 'var(--node-background)'}; color: ${node.format.fontColor ?? 'var(--node-color)'};`}, node.id, {contenteditable: true, on_focusout: e=>updateId(e.target)}),
								n('td.label',node.label, {contenteditable: true, on_focusout: e=>updateField(e.target, 'label')}),
								n('td', node.comment, {contenteditable:true, on_focusout: e=>updateField(e.target, 'comment')}),
								n('td.states', node.states.map(s=>s.id).join(', ')),
								n('td.parents', node.parents.map(p=>p.id).join(', ')),
							)),
						),
					),
				);
				$('.bnouterview').append(varDict);
			},
			sortButton(table, currentBn) {
				return n('button', 'Sort', {on_click: e=>{
					Menu({type:'contextMenu', items: [
						MenuAction('Original', _=>{
							currentBn.nodes.forEach(n => {
								table.querySelector('tbody').append(
									table.querySelector(`[data-node-id="${n.id}"]`)
								);
							});
						}),
						MenuAction('ID (A-Z)', _=>{
							let sortedNodes = currentBn.nodes.slice().sort((a,b)=>a.id.localeCompare(b.id));
							sortedNodes.forEach(n => {
								table.querySelector('tbody').append(
									table.querySelector(`[data-node-id="${n.id}"]`)
								);
							});
						}),
						MenuAction('ID (Z-A)', _=>{
							let sortedNodes = currentBn.nodes.slice().sort((a,b)=>b.id.localeCompare(a.id));
							sortedNodes.forEach(n => {
								table.querySelector('tbody').append(
									table.querySelector(`[data-node-id="${n.id}"]`)
								);
							});
						}),
						MenuAction('Label (A-Z)', _=>{
							let sortedNodes = currentBn.nodes.slice().sort((a,b)=>a.label.localeCompare(b.label));
							sortedNodes.forEach(n => {
								table.querySelector('tbody').append(
									table.querySelector(`[data-node-id="${n.id}"]`)
								);
							});
						}),
						MenuAction('Label (Z-A)', _=>{
							let sortedNodes = currentBn.nodes.slice().sort((a,b)=>b.label.localeCompare(a.label));
							sortedNodes.forEach(n => {
								table.querySelector('tbody').append(
									table.querySelector(`[data-node-id="${n.id}"]`)
								);
							});
						}),
						MenuAction('Roots to Leaves', _=>{
							currentBn.topologicalSort(currentBn.nodes).forEach(n => {
								table.querySelector('tbody').append(
									table.querySelector(`[data-node-id="${n.id}"]`)
								);
							});
						}),
						MenuAction('Leaves to Roots', _=>{
							currentBn.topologicalSort(currentBn.nodes).reverse().forEach(n => {
								table.querySelector('tbody').append(
									table.querySelector(`[data-node-id="${n.id}"]`)
								);
							});
						}),
						MenuAction('Colour (Roots-Leaves)', _=>{
							let colorMap = new Map();
							currentBn.topologicalSort(currentBn.nodes).forEach(n => colorMap.has(n.format.backgroundColor) || colorMap.set(n.format.backgroundColor, colorMap.size));
							let sortedNodes = currentBn.nodes.slice().sort((a,b)=>colorMap.get(a.format.backgroundColor) - colorMap.get(b.format.backgroundColor));
							sortedNodes.forEach(n => {
								table.querySelector('tbody').append(
									table.querySelector(`[data-node-id="${n.id}"]`)
								);
							});
						}),
						MenuAction('Colour (Leaves-Roots)', _=>{
							let colorMap = new Map();
							currentBn.topologicalSort(currentBn.nodes).reverse().forEach(n => colorMap.has(n.format.backgroundColor) || colorMap.set(n.format.backgroundColor, colorMap.size));
							let sortedNodes = currentBn.nodes.slice().sort((a,b)=>colorMap.get(a.format.backgroundColor) - colorMap.get(b.format.backgroundColor));
							sortedNodes.forEach(n => {
								table.querySelector('tbody').append(
									table.querySelector(`[data-node-id="${n.id}"]`)
								);
							});
						}),
					]}).popup(e.target);
				}});
			},
		},
	},
	reparamChooseFile() {
		$('#openDataFile').change(function() {
			app.readChosenFile(this, (fileData,fileName) => {
				app.loadData(fileData, {fileName});
				currentBn.addNodes(openData[openData.length-1]);
				currentBn.display();
				app.autoReparameterize(openData.length-1);
				currentBn.compile();
				app.autoLayout();
				app.updateBN(_=> {
				});
				notifyMessage('Loaded. Add arcs to auto-reparameterize. (So long as dataset isn\'t too large!)');
			});
		}).click();
		dismissActiveMenus();
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
			popupDialog(`<h2><img class="mbIcon" src="_/images/makeBelieve.png"> Make-Believe</h2>
				<div>Release `+titlePostfix.replace(/^.*\(R?(.*)\)$/, '$1')+`</div>
				<div class=license>`+toHtml(licenseString).replace(/\n\n/g, '<p>')+`</div>`, {className: 'about', buttons:[
				$('<button type=button>').text('OK').on('click', dismissDialogs),
			]});
		}, 'text');
	},
};

/// Extra utilities
var EachValidator = class {
	constructor() {
		this.nodes = null;
		this.nodeI = 0;
	}
	
	setup() {
		currentBn.addBoxToSidebar(
			n('div.eachValidatorPar',
				n('div.eachValidator',
					n('button.prev', '<', {on: {click: _=> this.prev()}}),
					n('button.next', '>', {on: {click: _=> this.next()}}),
					n('select.currentNode', {on_input: _=> this.newSelected()}),
					n('span.counter', n('span.thisNum', 0), '/', n('span.count', 0)),
				),
				n('div.fields',
					n('div.field.wide',
						n('label', 'Description'),
						n('div.description', {contenteditable:true, on_focusout: _=>this.descChanged()}),
					),
					n('div.field',
						n('label', 'Highlight:'), n('select.validateType', {on_input: _=>this.highlightCurrent()}, [
							['parents', 'Parents'],
							['children', 'Children'],
							['parentsChildren', 'Parents & Children'],
						].map(([i,label]) => n('option',{value:i},label))),
					),
				),
			),
			{title: 'Validator', onclose: _=>this.close()},
		);
		this.structureChange();
		currentBn.addListener('structureChange', _=>this.structureChange());
		this.highlightCurrent();
	}
	
	prev() {
		if (this.nodeI > 0)  this.nodeI--;
		this.highlightCurrent();
	}
	
	next() {
		if (this.nodeI < this.nodes.length-1)  this.nodeI++;
		this.highlightCurrent();
	}
	
	newSelected() {
		let nodeId = q('.eachValidator .currentNode').value;
		this.nodeI = this.nodes.findIndex(node => node.id==nodeId);
		this.highlightCurrent();
	}
	
	descChanged() {
		this.nodes[this.nodeI].updateObject({comment: q('.eachValidatorPar .description').innerTextTEMPFIX});
	}
	
	close() {
		this.nodeI = 0;
		this.nodes.forEach(n => n.el().css('opacity', 1));
		$('path.dependency').css('opacity', 1);
		currentBn.clearSelection();
		document.querySelector('.eachValidator').remove();
	}
	
	structureChange() {
		this.nodes = currentBn.topologicalSort(currentBn.nodes);
		let sel = q('.eachValidator .currentNode').value;
		q('.eachValidator .currentNode').set({innerHTML: ''}).append(...this.nodes.map(node => n('option', node.id)));
		if (sel)  q('.eachValidator .currentNode').value = sel;
		this.newSelected();
	}
	
	highlightCurrent() {
		if (this.nodeI >=0 && this.nodeI < this.nodes.length) {
			let node = this.nodes[this.nodeI];
			q('.eachValidator .thisNum').textContent = (this.nodeI+1);
			q('.eachValidator .count').textContent = this.nodes.length;
			q('.eachValidator .currentNode').value = node.id;
			q('.eachValidatorPar .description').innerTextTEMPFIX = this.nodes[this.nodeI].comment;
			this.nodes.forEach(n => n.el().css('opacity', 0.2));
			$('path.dependency').css('opacity', 0.2);
			node.el().css('opacity', 1);
			let nodesToSee = [];
			if (['parents','parentsChildren'].includes(q('.validateType').value)) {
				node.pathsIn.forEach(p => $(p.arcSelector.path).css('opacity', 1));
				node.parents.forEach(p => p.el().css('opacity', 1));
				nodesToSee.push(...node.parents);
			}
			if (['children','parentsChildren'].includes(q('.validateType').value)) {
				node.pathsOut.forEach(p => $(p.arcSelector.path).css('opacity', 1));
				node.children.forEach(p => p.el().css('opacity', 1));
				nodesToSee.push(...node.children);
			}
			currentBn.clearSelection();
			node.guiToggleSelect({on:true});
			/// Scroll it into view
			let top = Infinity, left = Infinity;
			for (let n of [node, ...nodesToSee]) {
				n = n.el()[0];
				top = Math.min(top, n.offsetTop);
				left = Math.min(left, n.offsetLeft);
			}
			console.log(top, left);
			if (!isElementInViewport(node.el()[0])) {
				currentBn.el().parentNode.scrollTo({top: top - 20, left: left - 20, block: 'nearest', behavior: 'smooth'});
			}
		}
	}
}


$(document).ready(function() {
	var exampleBns = `Asia.xdsl|Bunce's Farm.xdsl|Cancer.dne|Continuous Test.xdsl|Logical Gates.xdsl|
		NativeFish_V1.xdsl|RS Latch.xdsl|Umbrella.xdsl|Water.xdsl`.split(/\s*\|\s*/);
	var exampleBnActions = [];
	for (var i in exampleBns) {
		/// Need html escape function
		exampleBnActions[i] = MenuAction('<span data-name="'+exampleBns[i]+'">'+exampleBns[i]+'</span>', function(event) {
			window.location.href = "?file=bns/"+$(event.target.closest('.menuAction')).find('span').data("name");
		});
	}
	
	let updateMethodIs = {[mbConfig.updateMethod+(mbConfig.useWorkers ? 'Worker' : '')]: true};

	app.menu = Menu({type: "bar", items: [
		Menu({label:"File", items: [
			MenuAction("New...", function(){ app.newFile(); dismissActiveMenus(); }, {shortcut: 'Alt-N'}),
			MenuAction("Open...", function(){ app.loadFile(); dismissActiveMenus(); }, {shortcut: 'Ctrl-O'}),
			MenuAction("Close", function(){ app.closeFile(); dismissActiveMenus(); }),
			MenuAction(`Name: <input class=bnName type=text value="">`, ()=>{}),
			MenuAction("Save...", function(){ app.saveFile(); dismissActiveMenus(); }, {shortcut: 'Ctrl-S', type: 'saveItem'}),
			Menu({label:"Export", items: [
				MenuAction("Make-Believe .mb", function(){ app.saveFile('mb'); dismissActiveMenus(); }),
				MenuAction("GeNIe .xdsl", function(){ app.saveFile('xdsl'); dismissActiveMenus(); }),
				MenuAction("Netica .dne", function(){ app.saveFile('dne'); dismissActiveMenus(); }),
			]}),
			Menu({label: "Example BNs", items: exampleBnActions}),
			/*MenuAction('<hr>'),
			MenuAction('Print...', function(){ window.print() }),*/
		]}),
		Menu({label:"Edit", items: [
			MenuAction("Undo", function() { currentBn.changes.undo(); }, {shortcut: 'Ctrl-Z'}),
			MenuAction("Redo", function() { currentBn.changes.redo(); }, {shortcut: 'Ctrl-Y'}),
			MenuAction('<hr>', {type: 'separator'}),
			MenuAction("Cut", function() { app.clipboard.cut(); }, {shortcut: 'Ctrl-X'}),
			MenuAction("Copy", function() { app.clipboard.copy(); }, {shortcut: 'Ctrl-C'}),
			MenuAction("Paste", function() { app.clipboard.paste(); }, {shortcut: 'Ctrl-V'}),
			MenuAction("Delete", function() { app.clipboard.delete(); }, {shortcut: 'Delete'}),
			MenuAction('<hr>', {type: 'separator'}),
			MenuAction("Find", _=> { app.helpers.finder.init(); dismissActiveMenus(); }, {shortcut: 'Ctrl-F'}),
			MenuAction('<hr>', {type: 'separator'}),
			MenuAction("Select All", function() { currentBn.selectAll(); }, {shortcut: 'Ctrl-A'}),
			Menu({label:"Select", items: [
				['Root Nodes', 'rootNodes'],
				['Leaf Nodes', 'leafNodes'],
				['Arcs', 'arcs'],
			].map(([label,type]) => MenuAction(label, _=> { currentBn.setSelection(currentBn.findItems(type)); dismissActiveMenus(); }))}),
		]}),
		Menu({label:"View", items: [
			MenuAction('<input type="range" name="viewZoom" min="0.25" max="3" step="0.25" value="1"> <span class="viewZoomText">100%</span>', function(){}),
			MenuAction("Auto-Layout", function() { app.autoLayout(); dismissActiveMenus(); }, {shortcut: 'Ctrl-Shift-A'}),
			MenuAction("Auto-Layout (Left to Right)", function() { app.autoLayout(null, {direction: 'LR'}); dismissActiveMenus(); }, {shortcut: 'Ctrl-Shift-A'}),
			MenuAction(n('span',n('input.fullScreen',{type:'checkbox'})," Full Screen"), _=> {
				document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
				//q('input.fullScreen').set({checked: !document.fullscreenElement});
				dismissActiveMenus();
			}, {on_show: _=>q('input.fullScreen').set({checked: !!document.fullscreenElement})}),
			Menu({label: "Nodes", items: [
				MenuAction('Bare Labels Only', function() { app.changeNodeView('bareLabel'); dismissActiveMenus(); }),
				MenuAction('Labels Only', function() { app.changeNodeView('label'); dismissActiveMenus(); }),
				MenuAction('Labels & States Only', function() { app.changeNodeView('labelStates'); dismissActiveMenus(); }),
				MenuAction('Detailed Nodes', function() { app.changeNodeView('detailed'); dismissActiveMenus(); }),
				MenuAction('Stacked Bars', function() { app.changeNodeView('stacked'); dismissActiveMenus(); }),
				MenuAction('<hr>', {type: 'separator'}),
				MenuAction('Header: ID', function() { app.changeNodeHeader('id'); dismissActiveMenus(); }),
				MenuAction('Header: Label', function() { app.changeNodeHeader('label'); dismissActiveMenus(); }),
				MenuAction('Header: Label + ID', function() { app.changeNodeHeader('idLabel'); dismissActiveMenus(); }),
			]}),
			Menu({label: 'Spacing', items: [
				MenuAction('<span class=spaceLabel>Item Spacing:</span> <input type="range" name="viewSpacing" min="0.125" max="3" step="0.125" value="1"> <span class="viewSpacingText">100%</span>', function() {}),
				MenuAction('<span class=spaceLabel>Horizontal Spacing:</span> <input type="range" name="viewSpacing" data-type="horizontal" min="0.125" max="3" step="0.125" value="1"> <span class="viewSpacingText">100%</span>', function() {}),
				MenuAction('<span class=spaceLabel>Vertical Spacing:</span> <input type="range" name="viewSpacing" data-type="vertical" min="0.125" max="3" step="0.125" value="1"> <span class="viewSpacingText">100%</span>', function() {}),
				MenuAction('<hr>', {type: 'separator'}),
				MenuAction('Insert Square Space', _=> { app.insertSpace('rectangular'); dismissActiveMenus(); }),
				MenuAction('Insert Horizontal Space', _=> { app.insertSpace('horizontal'); dismissActiveMenus(); }),
				MenuAction('Insert Vertical Space', _=> { app.insertSpace('vertical'); dismissActiveMenus(); }),
			]}),
			MenuAction('<hr>', {type: 'separator'}),
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
			Menu({label:"Highlight on Selection", items: [
				['None', null],
				['Selection', 'selection'],
				['Parents', 'parent'],
				['Children', 'child'],
				['Parents & Children', 'direct'],
				['Ancestors', 'ancestor'],
				['Descendants', 'descendant'],
				['Markov Blanket', 'markovBlanket'],
				['D-Connected', 'dconnected'],
				['Directed Paths (2 nodes)', 'directedPaths'],
				['D-Connected Paths (2 nodes)', 'dconnectedPaths'],
				['D-Connected, Indirect (2 nodes)', 'dconnectedIndirect'],
				['Backdoor Paths', 'backpaths'],
				['Selection Bias', 'selectionBias'],
				['Closest Ancestors', 'confounder'],
				['Closest Descendants', 'collider'],
				].map(([label, type]) => {
					return MenuAction(n('span', n('input', {type:'checkbox',class:`highlightOnSelection ${type??'none'}`,checked:type?null:'true'}), label), _=> app.highlightOnSelection(type));
				})
			}),
			MenuAction('Highlight D-Connected Nodes', function() {
				if ($(".dconnected").length) {
					$(".dconnected").removeClass("dconnected");
				}
				else {
					/// Find d-connected nodes for all selected nodes (I'm not sure
					/// this makes much sense)
					for (var node of currentBn.selected) {
						//onsole.log('sel:', item);
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
			Menu({label:"Inference Methods", items: [
				MenuAction("Off", event => app.setUpdateMethod('off', false, event.target), {type: updateMethodIs.off ? 'checked' : ''}),
				MenuAction("Likelihood Weighting", event => app.setUpdateMethod('likelihoodWeighting', false, event.target), {type: updateMethodIs.likelihoodWeighting ? 'checked' : ''}),
				MenuAction("Likelihood Weighting (Worker)", event => app.setUpdateMethod('likelihoodWeighting',true, event.target), {type: updateMethodIs.likelihoodWeightingWorker ? 'checked' : ''}),
				MenuAction("Junction Tree", event => app.setUpdateMethod('junctionTree', false, event.target), {type: updateMethodIs.junctionTree ? 'checked' : ''}),
				MenuAction("Junction Tree (Worker)", event => app.setUpdateMethod('junctionTree', true, event.target), {type: updateMethodIs.junctionTreeWorker ? 'checked' : ''}),
				MenuAction("Auto Select (Worker)", event => app.setUpdateMethod('autoSelect', false, event.target), {type: updateMethodIs.autoSelect ? 'checked' : ''}),
			]}),
			MenuAction("Find Good Decisions", function() { app.findGoodDecisions(); dismissActiveMenus(); }),
			MenuAction('Time Limit: <input type="text" name="timeLimit" value="0">ms', function() { }),
			MenuAction('# Samples: <input type="text" name="iterations" value="'+BN.defaultIterations+'">', function() { }),
			Menu({label:"Learn", items: [
				MenuAction('Add Nodes from File', _=> { app.addNodesFromFile(); dismissActiveMenus(); } ),
				MenuAction('Parameters: Counting...', function() { app.learnParametersCounting(); dismissActiveMenus(); } ),
				MenuAction('Parameters: EM...', function() { app.learnParametersEm(); dismissActiveMenus(); } ),
				MenuAction('Structure: Naive Bayes...', function() { app.learnStructureNaiveBayes(); dismissActiveMenus(); } ),
				MenuAction('Structure: TAN...', function() { app.learnStructureTan(); dismissActiveMenus(); } ),
				MenuAction('<hr>', {type: 'separator'}),
				Menu({label: 'Auto re-parametrise with', type: 'reparameterizeMenu', items: [
					MenuAction('Choose file...', _=>app.reparamChooseFile()),
				]}),
			]}),
			MenuAction('Flatten Network', function() { app.flattenNetwork(); dismissActiveMenus(); } ),
			MenuAction('Compare Network...', function() { app.compareNetwork(); dismissActiveMenus(); } ),
		]}),
		Menu({label:'Evidence', type:'evidenceMenu', items: [
			MenuAction('Clear Evidence', function() { app.clearEvidence(); dismissActiveMenus(); } ),
			MenuAction('Calculate Probability of Evidence', function() { app.showProbabilityOfEvidence(); dismissActiveMenus(); } ),
			MenuAction('<hr>', {type: 'separator'}),
			MenuAction('Store Current', function() { app.storeEvidence(); }),
			MenuAction('<hr>', {type: 'separator'}),
		]}),
		Menu({label:"(Dev)", type: 'debugMenu', items: [
			MenuAction(n('span',n('input.cecCheck', {type:'checkbox',checked:mbConfig.crossEvidenceCaching?'checked':null}), 'Between evidence caching (JTree)'), _=>{
				mbConfig.crossEvidenceCaching = !mbConfig.crossEvidenceCaching;
				$('.cecCheck').prop('checked', mbConfig.crossEvidenceCaching);
			}),
			MenuAction('# Workers: <input type="text" name="numWorkers" value="2">', function() { }),
			MenuAction('# Perf Loops: <input type="text" name="perfLoops" value="100">', function() { }),
			MenuAction('# Perf Samples: <input type="text" name="perfIterations" value="10000">', function() { }),
			MenuAction('Perf Check Local', function() { currentBn.perfCheck(); }),
			MenuAction('Perf Check Worker', function() { currentBn.perfCheckWorker(); }),
			MenuAction("Load Data...", function(){ $('#openDataFile').change(function() {
				app.readChosenFile(this, (fileData,fileName) => app.loadData(fileData, {fileName}));
			}).click(); dismissActiveMenus(); }),
			Menu({label:"Tests", items: [
				MenuAction('Run Tests', function() { alert('Check JavaScript console for results'); testing.runTests(); }),
			]}),
			MenuAction(n('span', n('input.alosCheck', {type:'checkbox',checked:app.autoLayoutOnStructure?'checked':null}), 'Auto-Layout On Structure'), _=>{
				app.autoLayoutOnStructure = !app.autoLayoutOnStructure;
				$('.alosCheck').prop('checked', app.autoLayoutOnStructure);
				app.alosFunc ??= _=>{
					app.autoLayout();
				};
				if (app.autoLayoutOnStructure) {
					currentBn.addListener('structureChange', app.alosFunc);
				}
				else {
					currentBn.removeListener('structureChange', app.alosFunc);
				}
			}),
			MenuAction('<hr>', {type: 'separator'}),
			MenuAction('Validate Node by Node', _=> { new EachValidator().setup(); dismissActiveMenus(); }),
			MenuAction('Treament-Outcome Helper', _=>{app.helpers.treatmentOutcome.init(); dismissActiveMenus()}),
			MenuAction('Mutual Info Helper', _=>{app.helpers.mi.init(); dismissActiveMenus()}),
			MenuAction('Variable Dictionary Helper', _=>{app.helpers.varDict.init(); dismissActiveMenus()}),
			MenuAction('Network Information', _=>{app.helpers.stats.init(); dismissActiveMenus()}),
			MenuAction('Compare BN CPTs', _=>{app.helpers.compareCpts.init(); dismissActiveMenus()}),
			MenuAction('<hr>', {type: 'separator'}),
			Menu({label:'Themes', items: [
				MenuAction(n('div',
					n('input', {type: 'radio', name: 'menuTheme', value: ''}),
					'Original'
				), _=> {app.setTheme(null); dismissActiveMenus(); }),
				MenuAction(n('div',
					n('input', {type: 'radio', name: 'menuTheme', value: 'netica'}),
					'Netica'
				), _=> {app.setTheme('netica'); dismissActiveMenus(); }),
				MenuAction(n('div',
					n('input', {type: 'radio', name: 'menuTheme', value: 'genie'}),
					'GeNIe'
				), _=> {app.setTheme('genie'); dismissActiveMenus(); }),
			]}),
		]}),
		Menu({label:"Help", items: [
			MenuAction('Keyboard Shortcuts', function() { app.showShortcuts(); }),
			MenuAction('About Make-Believe', function() { app.about(); }),
		]}),
	]});

	$("body").prepend(app.menu.make());
	
	let theme = localStorage.getItem('theme');
	app.setTheme(theme);
	
	stormy.on('startup', function(available) {
		if (available) {
			var ma = MenuAction("Save As...", function(){ app.saveAsFile(); dismissActiveMenus(); }, {shortcut: 'Ctrl-Alt-S'});
			$('.bar.menu .saveItem')
				.after(ma.make())
				.find('.label').text('Save');
		}
	});

	/// Setup initial keyboard shortcuts (these can be overriden after the fact)
	Object.assign(keyboardShortcuts, app.menu.collectShortcuts());
	let isShortcutKeyDown = false;
	$(document).on('keydown', function(event) {
		if (isShortcutKeyDown)  return;
		if (!$(event.target).is('textarea, input, select, [contenteditable]')) {
			/// Make hash from event
			var keyHash = (event.ctrlKey?'Ctrl-':'')
				+ (event.altKey?'Alt-':'')
				+ (event.shiftKey?'Shift-':'')
				+ (event.metaKey?'Meta-':'')
				+ event.key[0].toUpperCase()+event.key.slice(1);
			//onsole.log(keyHash);
			if (keyboardShortcuts[keyHash]) {
				isShortcutKeyDown = true;
				event.preventDefault();
				keyboardShortcuts[keyHash].action();
				return false;
			}
		}
	});
	$(document).on('keyup', function(event) {
		isShortcutKeyDown = false;
	});

	/** Evidence **/
	$(".bnview").on("mousedown", ".stateName, .beliefBar", function() {
		var nodeId = $(this).closest(".node").attr("id").replace(/^display_/, '');
		var node = currentBn.nodesById[nodeId];
		var stateI = node.statesById[$(this).closest('.state').find('.stateName').text()].index;
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
		currentBn.notifyEvidenceChanged();
	});
	
	/** Item movement **/
	/** (and a little item selection) **/
	var mx = 0, my = 0;
	var disableSelect = 0;
	/// For aligning things when moving them
	var snapOn = true;
	var snapGridSize = 5;
	$(".bnview").on("mousedown touchstart", ".node h6, .submodel:not(.parent), .textBox", function(event) {
		if (event.target.closest('.editMode'))  return;
		let getOffset = el => ({left: el.offsetLeft, top: el.offsetTop});
		if (!event.originalEvent.touches)  event.preventDefault();
		if (event.which > 1)  return;
		mx = event.originalEvent.pageX ?? event.originalEvent.touches[0].pageX;
		my = event.originalEvent.pageY ?? event.originalEvent.touches[0].pageX;
		//onsole.log("mousedown:", mx, my);
		var $item = $(this).closest(".node, .submodel, .textBox");
		var o = getOffset($item[0]);
		var scale = Math.round($item[0].offsetWidth)/Math.round($item[0].getBoundingClientRect().width);
		disableSelect = 2;

		let focusedItem = currentBn.findItem($item[0]);
		/// Set the selection to the current item if it's outside of the current selection OR the altKey is pressed (which toggles selections)
		if (!currentBn.selected.has(focusedItem) || event.shiftKey) {
			currentBn.setSelection([focusedItem], {add: false, toggle: event.shiftKey});
		}
		var selectedOffsets = new Map();
		var selectedGraphItems = [];
		for (var item of currentBn.selected) {
			if (item.displayItem) {
				if (item.isGraphItem())  selectedGraphItems.push(item);
				selectedOffsets.set(item, getOffset($(`#display_${item.id}`)[0]));
			}
		}

		/// Get the width/height if the mousedown node was not part of the network
		var maxX = 0, maxY = 0;
		var graphItems = currentBn.getGraphItems();
		let {internalArcs, crossingArcs} = currentBn.getSelectedArcs();
		var hAlignItems = [];
		var vAlignItems = [];
		for (var i=0; i<graphItems.length; i++) {
			var graphItem = graphItems[i];
			if (graphItem.isHidden && graphItem.isHidden())  continue;
			if (("display_"+graphItem.id)==$item.attr("id"))  continue;
			var $graphItem = $("#display_"+graphItem.id);
			var n = draw.getBox($graphItem);
			maxX = Math.max(maxX, n.x+n.width);
			maxY = Math.max(maxY, n.y+n.height);
			if (currentBn.selected.has(graphItem))  continue;
			if (snapOn) {
				var $op = $graphItem.offsetParent();
				let op = $op[0];
				/// Prefer center alignments, to top/bottom
				hAlignItems.push([n.y+n.height/2,n,graphItem,"center"]);
				hAlignItems.push([n.y,n,graphItem,"top"]);
				hAlignItems.push([n.y+n.height,n,graphItem,"bottom"]);
				vAlignItems.push([n.x+n.width/2,n,graphItem,"center"]);
				vAlignItems.push([n.x,n,graphItem,"left"]);
				vAlignItems.push([n.x+n.width,n,graphItem,"right"]);
			}
		}
		/// ALSO add split points that are: 1) on arcs that cross the selection boundary
		/// and 2) only the nearest split point (since other's aren't involved in alignment)
		for (let crossingArc of crossingArcs) {
			let arcPathData = crossingArc.path.getPathData();
			if (arcPathData.length <= 2)  continue;
			let [parent,child] = crossingArc.getEndpoints();
			let snapSplitPoint = arcPathData[1];
			if (currentBn.selected.has(child)) {
				snapSplitPoint = arcPathData[arcPathData.length-2];
			}
			
			
			hAlignItems.push([snapSplitPoint.values[1], null, null, "center"]);
			vAlignItems.push([snapSplitPoint.values[0], null, null, "center"]);
		}

		var newLeft = null;
		var newTop = null;
		let lastDeltaX = 0;
		let lastDeltaY = 0;
		$(".bnouterview").on("mousemove touchmove", function(event) {
			event.preventDefault();
			$(".hAlignLine").hide();
			$(".vAlignLine").hide();
			$(".aligning").removeClass("aligning");
			var nmx = event.originalEvent.pageX ?? event.originalEvent.touches[0].pageX;
			var nmy = event.originalEvent.pageY ?? event.originalEvent.touches[0].pageY;
			//onsole.log("mousemove:", nmx, nmy, {left: o.left + (nmx - mx), top: o.top + (nmy - my)});
			/// Move the DOM object, but not the net object yet
			newLeft = o.left + (nmx - mx)*scale;
			newTop = o.top + (nmy - my)*scale;
			if (snapOn) {
				/// XXX I Should refactor to make this slimmer/more code reuse
				/// Find something to align with if possible
				for (var i=0; i<hAlignItems.length; i++) {
					var otherItem = hAlignItems[i];
					var halfHeight = $item.outerHeight()/2;
					if (otherItem[3]=="center" && Math.floor(otherItem[0]/snapGridSize)==Math.floor((newTop+halfHeight)/snapGridSize)) {
						newTop = otherItem[0]-halfHeight;
						if (otherItem[2])  $("#display_"+otherItem[2].id).addClass("aligning");
						if (!$(".hAlignLine").length)  $("<div class=hAlignLine>").appendTo(".bnview");
						$(".hAlignLine").show()[0].style.top = (newTop+halfHeight)+'px';
						break;
					}
					else if (Math.floor(otherItem[0]/snapGridSize)==Math.floor(newTop/snapGridSize)) {
						newTop = otherItem[0];
						if (otherItem[2])  $("#display_"+otherItem[2].id).addClass("aligning");
						if (!$(".hAlignLine").length)  $("<div class=hAlignLine>").appendTo(".bnview");
						$(".hAlignLine").show()[0].style.top = newTop+'px';
						break;
					}
					else if (Math.floor(otherItem[0]/snapGridSize)==Math.floor((newTop+$item.outerHeight())/snapGridSize)) {
						newTop = otherItem[0]-$item.outerHeight();
						if (otherItem[2])  $("#display_"+otherItem[2].id).addClass("aligning");
						if (!$(".hAlignLine").length)  $("<div class=hAlignLine>").appendTo(".bnview");
						$(".hAlignLine").show()[0].style.top = (newTop+$item.outerHeight())+'px';
						break;
					}
				}
				/// Find something to align with if possible
				for (var i=0; i<vAlignItems.length; i++) {
					var otherItem = vAlignItems[i];
					var halfWidth = $item.outerWidth()/2;
					/*console.log(otherItem[3], Math.floor(otherItem[0]/snapGridSize), "snaps",
						Math.floor((newLeft+halfWidth)/snapGridSize),
						Math.floor(newLeft/snapGridSize),
						Math.floor((newLeft+$item.outerWidth())/snapGridSize),
					);*/
					if (otherItem[3]=="center" && Math.floor(otherItem[0]/snapGridSize)==Math.floor((newLeft+halfWidth)/snapGridSize)) {
						newLeft = otherItem[0]-halfWidth;
						if (otherItem[2])  $("#display_"+otherItem[2].id).addClass("aligning");
						if (!$(".vAlignLine").length)  $("<div class=vAlignLine>").appendTo(".bnview");
						$(".vAlignLine").show()[0].style.left = (newLeft+halfWidth)+'px';
						break;
					}
					else if (Math.floor(otherItem[0]/snapGridSize)==Math.floor(newLeft/snapGridSize)) {
						newLeft = otherItem[0];
						if (otherItem[2])  $("#display_"+otherItem[2].id).addClass("aligning");
						if (!$(".vAlignLine").length)  $("<div class=vAlignLine>").appendTo(".bnview");
						$(".vAlignLine").show()[0].style.left = (newLeft)+'px';
						break;
					}
					else if (Math.floor(otherItem[0]/snapGridSize)==Math.floor((newLeft+$item.outerWidth())/snapGridSize)) {
						newLeft = otherItem[0]-$item.outerWidth();
						if (otherItem[2])  $("#display_"+otherItem[2].id).addClass("aligning");
						if (!$(".vAlignLine").length)  $("<div class=vAlignLine>").appendTo(".bnview");
						$(".vAlignLine").show()[0].style.left = (newLeft+$item.outerWidth())+'px';
						break;
					}
				}
			}
			/// Scale can muck up the alignment lines (sure, these probably shouldn't
			/// be in the div that gets scaled)
			
			$('.hAlignLine').css('width', (scale*100)+'%');
			$('.vAlignLine').css('height', (scale*100)+'%');
			$item[0].style.left = newLeft+'px';
			$item[0].style.top = newTop+'px';
			//$item.offset({left: newLeft, top: newTop});
			let deltaX = newLeft - o.left;
			let deltaY = newTop - o.top;
			var curMaxX = maxX, curMaxY = maxY;
			for (var selItem of currentBn.selected) {
				if (selItem.displayItem) {
					var $selItem = $(`#display_${selItem.id}`);
					if (!$selItem.is($item)) {
						var sItem = selectedOffsets.get(selItem);
						$selItem[0].style.left = ( sItem.left + deltaX )+'px';
						$selItem[0].style.top = ( sItem.top + deltaY )+'px';
					}
				}
			}
			let moveDeltaX = deltaX - lastDeltaX;
			let moveDeltaY = deltaY - lastDeltaY;
			//onsole.log(moveDeltaX, moveDeltaY);
			var {maxX: curMaxX, maxY: curMaxY} = currentBn.redrawArcs(selectedGraphItems, curMaxX, curMaxY, {moved: {deltaX: moveDeltaX, deltaY: moveDeltaY}});
			lastDeltaX = deltaX;
			lastDeltaY = deltaY;
			//for (var key in
			var n = currentBn.getGraphItemById($item.attr("id").replace(/^display_/,""));
			/// What's being moved is now always selected, so following not needed
			//if (n.pathsIn)  currentBn.redrawArcs(n, curMaxX, curMaxY);
			disableSelect = 3;
		});
		$(".bnouterview").on("mouseup touchend", function(event) {
			$(".hAlignLine").hide();
			$(".vAlignLine").hide();
			$(".aligning").removeClass("aligning");
			/// Update position of the node
			if (newLeft !== null) {
				var nmx = event.originalEvent.pageX ?? event.originalEvent.changedTouches[0].pageX;
				var nmy = event.originalEvent.pageY ?? event.originalEvent.changedTouches[0].pageX;
				//onsole.log("mouseup:", nmx, nmy, {left: o.left + (nmx - mx), top: o.top + (nmy - my)});
				//$item.offset({left: newLeft, top: newTop});

				/// Now it's final, update the net object
				var n = currentBn.getGraphItemById($item.attr("id").replace(/^display_/,""));
				var bn = n.net
				var dLeft = (newLeft - o.left);
				var dTop = (newTop - o.top);
				
				
				var els = document.elementsFromPoint(event.clientX ?? event.changedTouches[0].clientX, event.clientY ?? event.changedTouches[0].clientY);
				var submodel = els.find(el => el.matches('.submodel') && $(el).data('submodel').id != n.id);
				submodel = $(submodel).data('submodel');
				if (submodel) {
					var n = submodel.net.getGraphItemById($item.attr("id").replace(/^display_/,""));
					let net = submodel.net;
					net.changes.doCombined(_=>{
						n.guiMoveToSubmodel( submodel );
						for (var item of currentBn.selected) {
							//onsole.log(node.id, submodel.id);
							item.guiMoveToSubmodel( submodel );
							//Not sure what the following was supposed to do
							//selectedOffsets[node]
						}
					});
					net.guiUpdateAndDisplayForLast();
					net.clearSelection();
				}
				else {
					var oldPos = {x: n.pos.x, y: n.pos.y};
					var newPos = {x: n.pos.x+dLeft, y: n.pos.y+dTop};
					/// Make array
					var items = [...currentBn.selected].filter(node => node.id != n.id);
					var itemPos = items.map(item => Object.assign({}, item.pos));
					var newItemPos = itemPos.map(pos => ({x: pos.x+dLeft, y: pos.y+dTop}));
					
					bn.changes.doCombined(_=> {
						n.moveTo(newPos.x, newPos.y);
						items.forEach((item,i) => {
							item.moveTo(newItemPos[i].x, newItemPos[i].y);
						});
					});
				}

			}
			$(".bnouterview").unbind("mousemove touchmove").unbind("mouseup touchend");
			

			disableSelect -= 1;
		});
	});
	
	/// Move by keyboard
	let keyMoveKeyup = null;
	let savedItemPos = null;
	document.addEventListener('keydown', event => {
		console.log('x');
		if (currentBn.selected.size && !event.target.matches('textarea, input, select, [contenteditable]')
				&& ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
			if (!keyMoveKeyup) {
				/// Save all item positions on first key down
				savedItemPos = [...currentBn.selected].map(item => [item,Object.assign({},item.pos)]);
				document.addEventListener('keyup', keyMoveKeyup = event => {
					/// Collect new positions
					newItemPos = [...currentBn.selected].map(item => [item,Object.assign({},item.pos)]);
					/// Restore item positions before setting them undoably
					savedItemPos.forEach(([item,pos]) => Object.assign(item.pos, pos));
					currentBn.changes.doCombined(_=> {
						/// Set undoably
						newItemPos.forEach(([item,pos]) => item.moveTo(pos.x, pos.y));
					});
					if (currentBn.changes.lastAction()?.type == 'ItemMove') {
						/// Coalesce all ItemMoves (not particularly efficiently)
						currentBn.changes.linkToPrevious();
					}
					document.removeEventListener('keyup', keyMoveKeyup);
					keyMoveKeyup = null;
				});
			}
			for (let item of currentBn.selected) {
				let dx = 0, dy = 0;
				if      (event.key == 'ArrowRight')  dx = 10;
				else if (event.key == 'ArrowLeft')  dx = -10;
				else if (event.key == 'ArrowUp')  dy = -10;
				else if (event.key == 'ArrowDown')  dy = 10;
				if (event.ctrlKey) { dx*=3; dy*=3; }
				if (event.shiftKey) { dx*=0.2; dy*=0.2; }
				item.moveTo(item.pos.x+dx, item.pos.y+dy, false);
			}
		}
	});

	/** Select multiple objects (currently only includes nodes) **/
	$(".bnmidview").on('mousedown', function(event) {
		if (!$(event.target).closest('.item').length) {
			if (!event.shiftKey && !event.altKey && event.button==0 && !event.target.closest('.menu'))  currentBn.clearSelection();
			var turnOn = !event.altKey ? true : false;
			var view = $('.bnmidview').offset();
			var {pageX: origX, pageY: origY} = event;
			var $rectSelect = $('<div class=rectSelect>')
				.css({top: origY - view.top, left: origX - view.left, display: 'none'})
				.appendTo('.bnmidview');
			event.preventDefault();
			$(window).on('mousemove.rectSelect', function(event) {
				var {pageX: curX, pageY: curY} = event;
				$rectSelect.css({
					top: (curY < origY ? curY : origY) - view.top, left: (curX < origX ? curX : origX) - view.left,
					width: Math.abs(curX - origX), height: Math.abs(curY - origY), display: 'block'});
			}).on('mouseup.rectSelect', function(event) {
				/// Which items are contained in the rectangle?
				//var rect = Object.assign($rectSelect.offset(), {width: $rectSelect.width(), height: $rectSelect.height()});
				var rect = $rectSelect[0].getBoundingClientRect();
				$('.bnview .item').each(function() {
					//var item = Object.assign($(this).offset(), {width: $(this).width(), height: $(this).height()});
					var item = this.getBoundingClientRect();
					//onsole.log(item, rect);
					if (rect.top <= item.top && item.top+item.height <= rect.top+rect.height
							&&
							rect.left <= item.left && item.left+item.width <= rect.left+rect.width) {
						console.log('hit');
						currentBn.findItem(this).guiToggleSelect({on:turnOn});
					}
				});
				$(window).off('.rectSelect');
				/// This interferes with other double-click events in Chrome if it's not executed
				/// outside the current event loop.
				setTimeout(_=> $rectSelect.remove(), 0);
			});
		}
	});

	/** Arc drawing. Yay! **/
	var startNode = null;
	var DCTIMEOUT = 200; //ms
	var timerId = null;
	var singleClick = true;
	$(".bnview").on("mousedown touchstart", ".node .hotSpot, .node .hotSpotReverse", function(event) {
		event.pageX ??= event.touches[0].pageX;
		event.pageY ??= event.touches[0].pageY;
		//$('.bnview').css('touch-action', 'none');
		/// XXX: Fix, make better way of handling scale!
		let $item = currentBn.getGraphItems()[0].el();
		var scale = Math.round($item[0].offsetWidth)/Math.round($item[0].getBoundingClientRect().width);
		
		$('body').addClass('disableSelections');
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
			var sourcePoint = {x: event.pageX*scale - ncs.left, y: event.pageY*scale - ncs.top};
			var destPoint = {x: sourcePoint.x, y: sourcePoint.y};
			var sourceBox = draw.getBox($node);
			var destBox = {x: sourceBox.x, y: sourceBox.y, width: 1, height: 1, borderRadius: 0};
			var par = sourceBox;
			var child = destBox;
			var $arc = null;
			var arcDirection = 0; /// 0 means left/down, 1 means right/up
			var origCanvas = {width: $(".netSvgCanvas").width(), height:$(".netSvgCanvas").height()};
			
			/// If we're creating a parent (hotSpotReverse), switch around par/child
			if ($(event.target).is('.hotSpotReverse')) {
				par = destBox;
				child = sourceBox;
				arcDirection = 1;
			}

			var exitSide = null;
			function tempMouseMove(event) {
				event = event.originalEvent;
				event.preventDefault();
				event.pageX ??= event.touches[0].pageX;
				event.pageY ??= event.touches[0].pageY;
				destPoint.x = event.pageX - ncs.left;
				destPoint.y = event.pageY - ncs.top;
				/*if (!exitSide) {
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
				}*/
				/// Draw arrow to this point
				destBox.x = (event.pageX - $(".netSvgCanvas").offset().left)*scale;
				destBox.y = (event.pageY - $(".netSvgCanvas").offset().top)*scale;
				/// FIX: Obviously don't want to draw a new arrow all the time!
				if (!$arc) {
					$arc = draw.drawArrowBetweenBoxes($('.netSvgCanvas'), par, child, {clickable: false});
					//onsole.log($arc.attr('d'), par, child);
				}
				else {
					draw.drawArrowBetweenBoxes($arc, par, child, {clickable: false});
					//onsole.log($arc.attr('d'), par, child);
				}
				/// Update max x/y as extents for canvas if necessary
				var b = draw.getBox($arc);
				//onsole.log("ARC BOX:", b, $arc);
				var maxX = Math.max(origCanvas.width, (b.x+b.width)*scale);
				var maxY = Math.max(origCanvas.height, (b.y+b.height)*scale);
				//onsole.log(maxX, maxY);
				if (maxX != origCanvas.width || maxY != origCanvas.height) {
					$(".netSvgCanvas").attr("width", maxX).attr("height", maxY);
				}
			}

			$(window).on("mousemove touchmove", tempMouseMove);

			/// We bind to window, so that *any* mouseup event (even outside of window)
			/// clears the startNode
			$(window).one("mouseup touchend", function(event) {
				event.pageX ??= event.changedTouches[0].pageX;
				event.pageY ??= event.changedTouches[0].pageY;
				event.target = event.changedTouches ? document.elementFromPoint(event.changedTouches[0].clientX,event.changedTouches[0].clientY) : event.target;
				console.log(event, event.target);
				$('body').removeClass('disableSelections');
				if (!singleClick)  event.preventDefault();
				$(window).unbind("mousemove touchmove", tempMouseMove);
				/// The mouseup event needs to be from the left-click,
				/// not a right-click (or middle-click), which would cancel the drag
				if (startNode && (event.which == 1 || event.changedTouches)) {
					let $node = $(event.target).closest('.node');
					let $submodel = $(event.target).closest('.submodel');
					function addToNode(endNode) {
						/// Check that the arc is valid
						if ($arc)  $arc.remove();
						if (!startNode.wouldBeCycle(endNode,arcDirection)) {
							if (arcDirection==1) {
								startNode.guiAddParents([endNode]);
							}
							else {
								endNode.guiAddParents([startNode]);
							}
							currentBn.guiUpdateAndDisplayForLast();
						}
						else {
							return false;
						}
						return true;
					}
					if ($node.length) {
						let endNode = currentBn.find($node);
						/// If endNode is in a selection, add to all selected
						if (currentBn.selected.size && currentBn.selected.has(endNode)) {
							let numCycles = 0;
							for (let node of currentBn.selected) {
								numCycles += !addToNode(node);
							}
							if (numCycles>0) {
								notifyError(`Could not add ${numCycles} arcs as ${numCycles==1?'it would create a cycle':'they would create cycles'}.<br>(And making DBNs not supported yet.)`);
							}
						}
						/// If endNode is single node, add directly to it
						else {
							if (!addToNode(endNode)) {
								notifyError('Cannot add arc as it would create a cycle.<br>(And making DBNs not supported yet.)');
							}
						}
					}
					else if ($submodel.length) {
						if ($arc)  $arc.remove();
						let thisStartNode = startNode;
						let submodel = currentBn.find($submodel);
						let descendants = thisStartNode.getDescendants();
						let ancestors = thisStartNode.getAncestors();
						let nodes = n('ul');
						let subNodes = submodel.getAllNodes()
							.filter(n =>
								/// Don't link to children or parents
								!n.children.includes(thisStartNode) && !n.parents.includes(thisStartNode)
								/// Don't parent link to descendants, or child link to ancestors
								&& !(arcDirection==1 ? descendants.includes(n) : ancestors.includes(n))
								/// And don't link to myself!
								&& n != thisStartNode
							);
						subNodes = currentBn.topologicalSort(subNodes);
						//subNodes.sort((a,b) => a.id < b.id ? -1 : 1);
						subNodes.stableSort((a,b) => a.getSubmodelPathStr() <= b.getSubmodelPathStr() ? -1 : 1);

						let lastNode = null;
						for (let node of subNodes) {
							if (!lastNode) {
								nodes.appendChild( n('h3', node.getSubmodelPathStr()) );
							}
							else if (lastNode && node.getSubmodelPathStr() != lastNode.getSubmodelPathStr()) {
								nodes.appendChild( n('h3', node.getSubmodelPathStr()) );
							}
							let li = n('li',
								n('a', node.id, {href: 'javascript:void(0)', 'data-node-id': node.id, on:{click(event) {
									let endNode = currentBn.find( $(event.target).data('nodeId') );
									if (arcDirection==1) {
										thisStartNode.guiAddParents([endNode]);
									}
									else {
										endNode.guiAddParents([thisStartNode]);
									}
									currentBn.guiUpdateAndDisplayForLast();
									dismissDialogs();
								}}})
							);
							nodes.appendChild(li);
							lastNode = node;
						};
						popupDialog([`Select the node you wish to be the child:`, nodes], {buttons:[
							n('button', 'Cancel', {type:'button', on:{click:dismissDialogs}}),
						]});
					}
					/// Make a new node especially
					else {
						var i = 0;
						while (currentBn.nodesById["node"+i]) i++;
						if (!$(event.target).closest('.graphItem').length) {
							/// Remove the arc we were using temporarily
							if ($arc)  $arc.remove();
							var nsc = $('.netSvgCanvas').offset();
							let dropX = (event.pageX - nsc.left)*scale;
							let dropY = (event.pageY - nsc.top)*scale;
							newNode = currentBn.guiAddNode("node"+i, ["true","false"], {
								cpt:[.5,.5],
								pos: {x: dropX, y: dropY},
								submodelPath: currentBn.currentSubmodel,
							});
							/// Position it correctly
							let nodeBox = draw.getBox(newNode.el());
							let tempX = newNode.pos.x - nodeBox.width/2;
							let tempY = newNode.pos.y - nodeBox.height/2;
							newNode.el().css({left: tempX, top: tempY});
							let endPoints = draw.computeArrowBetweenBoxes(currentBn.outputEl, draw.getBox(newNode.el()), draw.getBox(startNode.el()));
							let newX = tempX - (endPoints[0].x - dropX);
							let newY = tempY - (endPoints[0].y - dropY);
							newNode.apiMoveTo(newX, newY);
							newNode.el().css({left: newX, top: newY});
							if (arcDirection==1) {
								startNode.guiAddParents([newNode]);
							}
							else {
								newNode.guiAddParents([startNode]);
							}
							currentBn.changes.linkToPrevious();
							currentBn.guiUpdateAndDisplayForLast(null, _=> {
								$('#display_'+newNode.id+' h6').map(function() { currentBn.findItem(this).lightNodeEdit()})
							});
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
	if (0) {$(".bnview").on("mousedown", function(event) {
		$('.bnview').one('mouseup', function(event2) {
			/// ONLY CLEAR SELECTION IF:
			///  - no item under the cursor
			///  - shift key not depressed
			if (event.target.closest('.item') || event.shiftKey)  return;
			if (event.pageX == event2.pageX && event.pageY == event2.pageY) {
				currentBn.clearSelection();
				if (!$(event.target).closest(document.activeElement).length) {
					document.activeElement.blur();
				}
			}
		});
	});}
	/* Reenable (and update) following once working properly:

	$(".bnview").on("click", function(event) {
		for (var nodeId in currentBn.selected) {
			currentBn.nodesById[nodeId].guiToggleSelect();
		}
	});
	*/

	if (0){
	/// This prevents the 'clearSelection' from triggering, when we don't want it
	/// (If I revert to just 'click', rather than mousedown/up for clearSelection,
	/// I need to change, obviously.)
	$('.bnview').on('mousedown', '.node h6, .submodel, .textBox, .dependencyClickArea', function(event) {
		event.stopPropagation();
	});

	/** Select items (if changing, make sure to update the clearSelection prevention above) **/
	$(".bnview").on("click", ".node h6, .submodel, .textBox", function(event) {
		//onsole.log("dis:",disableSelect);
		disableSelect -= 1;
		if (disableSelect) { disableSelect -= 1; return; }
		var itemId = $(this).closest(".item")[0].id.replace(/^display_/, '');

		if (event.ctrlKey) {
			currentBn.find(itemId).guiToggleSelect(false);
		}
		else {
			currentBn.clearSelection();
			currentBn.find(itemId).guiToggleSelect(true);
		}
	});
	}
	
	/** Select arcs **/
	$('.bnview').on('click', '.dependencyClickArea', function(event) {
		if (event.which == 1) {
			/*
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
				currentBn.selected.delete($p.data('arcSelector'));
			}
			*/
			let $p = $(this).data('path');
			$p.data('arcSelector').guiToggleSelect();
		}
	});
	
	$(document).on('keydown', function(event) {
		var $t = $(event.target);
		if (!$t.closest('.node, .submodel, .text, input, select, textarea, [contenteditable]').length) {
			if (event.key == "Delete") {
				currentBn.changes.startCombined();
				for (var item of currentBn.selected) {
					item.guiDelete();
					currentBn.selected.delete(item);
				}
				currentBn.changes.endCombined();
				currentBn.guiUpdateAndDisplayForLast();
			}
		}
	});

	/** This needs to change **/
	$(".bnview").on("dblclick", ".textBox", function(event) {
		var $textBox = $(this);
		var textBox = currentBn.getItem(this);
		event.preventDefault();
		event.stopPropagation();
		textBox.guiEdit();
	});

	/// Submodel navigation
	$(".bnview").on("dblclick", ".submodel", function() {
		let submodelToView = $(this).data("submodel").submodelPath.concat($(this).data("submodel").id ? [$(this).data("submodel").id] : []);
		currentBn.guiOpenSubmodel(submodelToView);
		currentBn.clearSelection();
		return false;
	});

	/// Double click selections cause all sorts of grief :(
	/// This cancels them for non-editable elements
	document.addEventListener('mousedown', function (event) {
		if ($(event.target).is('input,select,textarea,[contenteditable]'))  return;
		if (event.detail > 1) {
			event.preventDefault();
		}
	}, false);
	$(".bnview").on("dblclick", function(event) {
		/// Only trigger in blank areas
		if (!$(event.target).is(".bnview") && !$(event.target).is(".netSvgCanvas"))  return;
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
						let i = 0;
						while (currentBn.nodesById["node"+i]) i++;
						let node = currentBn.guiAddNode('node'+i, null, {cpt:[.5,.5], pos: {x: offsetX, y: offsetY}, submodelPath: currentBn.currentSubmodel});
						currentBn.guiUpdateAndDisplayForLast(null, _=> $('#display_'+node.id+' h6').map(function() { currentBn.findItem(this).lightNodeEdit()}));
					}
					menu.dismiss();
					return false;
				}),
				MenuAction('Submodel', () => {
					currentBn.guiAddSubmodel(null, {pos: {x: offsetX, y: offsetY}, addToCanvas: true});
					menu.dismiss();
					return false;
				}),
				MenuAction('Text Box', () => {
					var textBox = currentBn.guiAddTextBox('[Insert text]', {pos: {x: offsetX, y: offsetY}});
					textBox.guiEdit({combine: true});
					//$('#display_'+textBox.id).trigger('dblclick');
					menu.dismiss();
					return false;
				}),
			],
		});
		menu.popup({left: event.clientX, top: event.clientY - 15});
		event.preventDefault();
		return false;
	});

	$(document).on("contextmenu", ".node, .submodel, .textBox", function(event) {
		if (event.shiftKey)  return true;
		if (event.ctrlKey || event.target.closest('.submodel')) {
			var $displayItem = $(this);
			var item = currentBn.getItemById($displayItem.attr("id").replace(/^display_/, ''));
			item.contextMenu(event);
			return false;
		}
	});
	
	$(document).on("contextmenu", ".dependencyClickArea", function(event) {
		if (event.shiftKey)  return false;
		$(this).data('path').data('arcSelector').contextMenu(event);
		return false;
	});
	
	/// App focus. Not sure how expensive this is.
	document.addEventListener('click', event => {
		app.windowFocus = event.target.closest('.dialog, .bnview');
	});
	
	/// BN Name
	$('.menu.bar .bnName').on('input change', function(evt) {
		let newName = $(this).val();
		currentBn.fileName = currentBn.fileName.replace(/^.*(\..*?)$/, newName+'$1');
		app.updateBnName();
	});

	$("[name=viewZoom]").on("input", function(evt) {
		$('.itemList').addClass('unfocusMenu');
		$(this).closest('.menuAction').addClass('focusMenu');
		var $range = $(evt.target);
		$(".bnview").css({transformOrigin: 'top left', transform: 'scale('+$range.val()+')'});
		$(".viewZoomText").text(Math.round($range.val()*100)+"%");
	}).on('change mouseup', function(evt) {
		$('.itemList').removeClass('unfocusMenu');
		$(this).closest('.menuAction').removeClass('focusMenu');
	}).on("dblclick", function(evt) {
		var $range = $(evt.target);
		$range.val(1);
		$range.trigger("change");
	});

	let doingSpacing = false;
	let savedPos = null;
	let currentSubItems = null;
	let spacingMins = {x: null, y: null};
	$("[name=viewSpacing]").on("input", function(evt) {
		$('.itemList').addClass('unfocusMenu');
		$(this).closest('.menuAction').addClass('focusMenu');
		let type = this.dataset.type;
		let mins = spacingMins;
		if (!doingSpacing) {
			currentSubItems = currentBn.getCurrentSubmodel().getItems();
			savedPos = currentSubItems.map(n => ({...n.pos}));
			mins.x = 10000000, mins.y = 100000000;
			savedPos.forEach(pos => {
				mins.x = Math.min(pos.x, mins.x);
				mins.y = Math.min(pos.y, mins.y);
			});
		}
		doingSpacing = true;
		let $range = $(evt.target);
		let scale = Number($range.val());
		let xScale = scale;
		let yScale = scale;
		if (type == 'horizontal')  yScale = 1;
		if (type == 'vertical')  xScale = 1;
		$(this).closest('.menuAction').find('.viewSpacingText').text(Math.round(scale*100)+"%");
		currentSubItems.forEach((n,i) => { n.moveTo((savedPos[i].x-mins.x)*xScale+mins.x, (savedPos[i].y-mins.y)*yScale+mins.y, false); });
	}).on('change', function(evt) {
		$('.itemList').removeClass('unfocusMenu');
		$(this).closest('.menuAction').removeClass('focusMenu');
		currentBn.changes.doCombined(_=> {
			currentSubItems.forEach((n,i) => {
				let newPos = {...n.pos};
				n.apiMoveTo(savedPos[i].x, savedPos[i].y);
				n.moveTo(newPos.x, newPos.y);
			});
		});
		$(evt.target).val(1);
		$('.viewSpacingText').text('100%');
		currentSubItems = null;
		doingSpacing = false;
		savedPos = null;
	}).on('mouseup', function(evt) {
		$('.itemList').removeClass('unfocusMenu');
		$(this).closest('.menuAction').removeClass('focusMenu');
	});/*.on("dblclick", function(evt) {
		let $range = $(evt.target);
		$range.val(1);
		$range.trigger("change");
	});*/

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
			app.fileLoaded(dt.files[0], app.updateBN);
		}
	}).on("dragover", function(event) {
		event.preventDefault();
		// Set the dropEffect to move
		event.originalEvent.dataTransfer.dropEffect = "open";
	});
	
	$(document).on('keydown', (event) => {
		if (event.ctrlKey && event.key == 'F12') {
			$('.console').toggle();
			$('.consoleInput').focus();
		}
	});
	
	consoleHistory = [];
	consoleHistory.pos = 0;
	$('.consoleInput').on('keydown', (event) => {
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
			
			let lns = txt.split(/;/);
			
			for (let ln of lns) {
				var m = ln.match(/^(.*)(<-|->)(.*)$/);
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
	
	
	Node.handleEvents($('.bnComponent')[0]);
	TextBox.handleEvents($('.bnComponent')[0]);
	
	$(window).on('beforeunload', function() {
		if (currentBn && currentBn.unsavedChanges) {
			return false;
		}
	});

	window.matchMedia("print").addEventListener('change',function(e) {currentBn.updateArcs()});
	$(window).on('beforeprint', function() {
		$('#printSheet').attr('media', 'screen');
		currentBn.updateArcs();
		$('#printSheet').attr('media', 'print');
	}).on('afterprint', function() {
		currentBn.updateArcs();
	});

	if (window.qs.file) {
		loadFromServer(window.qs.file, _=>{
			app.updateBN(_=>{
				if (window.parent !== window)  window.parent.postMessage({type:'fileLoaded'});
			});
		});
	}
	else {
		let bn = new BN({filename: `bn${++guiBnCount}.xdsl`});
		app.openBn(bn);
		currentBn.display();
	}
	
	/* Fix contenteditable empty on td/th on firefox.
	Block empty contenteditable fixing with, e.g., <div default-empty> */
	q(document).listeners.add('focusin', event => {
		let ce = event.target.matches?.('[contenteditable]:is(td,th):not([default-empty])') && event.target;
		if (ce) {
			if (!ce.textContent.trim())  ce.innerHTML='<br>';
		}
	}).add('focusout', event => {
		let ce = event.target.matches?.('[contenteditable]:is(td,th):not([default-empty])') && event.target;
		if (ce) {
			if (!ce.textContent.trim())  ce.innerHTML='';
		}
	});
	
	window.dispatchEvent(new Event('MakeBelieveLoaded'));
});

window.addEventListener('MakeBelieveLoaded', event => {
	startUpTests();
});

function addStyles(name, styles) {
	let s = document.createElement('style');
	s.textContent = styles;
	document.body.append(s);
}
var styles = {add: addStyles};

/// Example: postMessage(['currentBn', 'addNode', ['Hello']])
window.addEventListener('message', event => {
	let retValue = window[event.data[0]][event.data[1]](...(event.data[2] ?? []));
	let toReturn = [retValue];
	toReturn.type = 'return';
	try {
		event.source.postMessage(toReturn,'*');
	} catch(err) {
		event.source.postMessage({type:'return'},'*');
	};
});