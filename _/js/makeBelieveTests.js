function _makeSimplePromise(func, ...args) {
	return new Promise((resolve,reject) => {
		func(...args, (...callbackArgs) => {
			/// Auto convert multiple 'return' args to an array for returning
			resolve(callbackArgs.length==1 ? callbackArgs[0] : callbackArgs);
		});
	});
}

var makeSimplePromise = new Proxy(function(){}, {
	get(target, property, receiver) {
		return function(...args) {
			return _makeSimplePromise(window[property], ...args);
		};
	},
	
	apply(target, thisArg, argList) {
		var func = argList[0];
		var args = argList.slice(1);
		console.log(func, args);
		return _makeSimplePromise(func, ...args);
	},
});

let openWindows = [];

function openInWindow(el, title) {
	let testingProps = JSON.parse(localStorage.getItem('testing') ?? '{}');
	let posStr = testingProps.winLeft!=undefined ? `left=${testingProps.winLeft},top=${testingProps.winTop}` : '';
	let win = window.open('about:blank', 'testWindow', 'popup=yes,width=380,height=470,'+posStr);
	win.addEventListener('load', _=>{
		win.document.body.append(el);
		openWindows.push(win);
	});
	win.addEventListener('beforeunload', _=>{
		localStorage.setItem('testing', JSON.stringify({winLeft:win.screenLeft, winTop:win.screenTop}));
	});
}

window.addEventListener('beforeunload', event => {
	openWindows.forEach(win => win.close());
});

var testing = {
	init() {
		let testingDiv = n('div.testing',
			n('style',`
				.test { padding: 5px; border: solid 1px #ccc; }
				:nth-child(n + 2 of .test) { border-top: 0; }
				.test:hover { background: #eee; cursor: pointer; }
				.test {
					&[data-status=pass] { background: green; color: white; }
					&[data-status=fail] { background: red; }
					&[data-status=testError] { background: purple; }
					&[data-status=unknown] { background: #fee; }
				}
			`),
			this.makeTestList(this.tests),
		);
		openInWindow(testingDiv, {title: 'GUI Testing'});
	},
	makeTestList(tests) {
		let logger = (...args) => console.log(...args);
		return Object.entries(tests).map(([name,value]) => {
			if (name == '_title') {
				return n('h2', value);
			}
			else if (typeof(value)=='object' && value != null) {
				return this.makeTestList(value);
			}
			else {
				let testFunc = value;
				return n('div.test', name, {on_click: async event=>{
					let error = null;
					try {
						let res = await testFunc(logger);
						if (res === true)  status = 'pass';
						else if (res === false)  status = 'fail';
						else status = 'unknown';
					}
					catch (e) { status = 'testError'; error = e; }
					q(event.target.closest('.test')).setAttribute('data-status', status);
					if (error)  throw error;
				}});
			}
		});
	},
	tests: {
		_title: 'Basic Tests',
		'Basic inference - Asia': async function(callback) {
			await makeSimplePromise.loadFromServer('bns/Asia.xdsl');
			var savedIterations = currentBn.iterations;
			currentBn.iterations = 1000000;
			
			await new Promise(r=>app.updateBn(r));
			var xrayYesProb = Number($('#display_xray .state .prob').eq(0).text());
			var areEqual1 = testing.testNumbersEqual('xrayYesProb=0.11?', xrayYesProb, 0.11, 0.005);
			
			$('#display_dysp .stateName').eq(1).trigger('mousedown');
			await new Promise(r=>app.updateBn(r));
			var smokeYesProb = Number($('#display_smoke .state .prob').eq(0).text());
			var areEqual2 = testing.testNumbersEqual('smokeYesProb=0.4?', smokeYesProb, 0.4, 0.05);
			currentBn.iterations = savedIterations;
			
			callback('Basic Inference - Asia', areEqual1 && areEqual2);
			
			return areEqual1 && areEqual2;
		},
		'Decision Nets - Umbrella': async function(callback) {
			await makeSimplePromise.loadFromServer('bns/Umbrella.xdsl');
			var savedIterations = currentBn.iterations;
			currentBn.iterations = 1000000;

			await new Promise(r=>app.updateBn(r));
			var ev = Number($('.status .expectedValue .val').eq(0).text());
			var areEqual1 = testing.testNumbersEqual('EV=52.5?', ev, 52.5, 1);
			
			$('#display_Weather .stateName').eq(1).trigger('mousedown');
			await new Promise(r=>app.updateBn(r));
			var ev = Number($('.status .expectedValue .val').eq(0).text());
			var areEqual2 = testing.testNumbersEqual('EV=60?', ev, 60, 1);
			currentBn.iterations = savedIterations;
			callback('Decision Nets - Umbrella', areEqual1 && areEqual2);
			
			return areEqual1 && areEqual2;
		},
		'Submodels - Bunce\'s Farm': async function(callback) {
			await makeSimplePromise.loadFromServer('bns/Bunce\'s Farm.xdsl');
			var savedIterations = currentBn.iterations;
			currentBn.iterations = 1000000;

			await new Promise(r=>app.updateBn(r));
			var ev = Number($('.status .expectedValue .val').eq(0).text());
			var areEqual1 = testing.testNumbersEqual('EV=287.3?', ev, 287.3, 1);
			callback('Submodels - Bunce\'s Farm', areEqual1);
			/*$('#display_Weather .stateName').eq(1).trigger('click');
			updateBN(function() {
				var ev = Number($('.status .expectedValue .val').eq(0).text());
				var areEqual2 = testing.testNumbersEqual('EV=95?', ev, 95, 1);
				currentBn.iterations = savedIterations;
				callback('Decision Nets - Umbrella', areEqual1 && areEqual2);
			});*/
			return areEqual1;
		},
		'Formatting': async function(callback) {
			await makeSimplePromise.loadFromServer('bns/Asia.xdsl');
			$('#display_xray').trigger('contextmenu');
			$('button[data-for=format]').trigger('click');
			$('[data-object=format][name=backgroundColor]').val('#ff0000');
			$('[data-object=format][name=backgroundColor]')[0].dispatchEvent(new Event('input'));
			await new Promise(r=>setTimeout(r));
			$('.controls [name=save]').trigger('click');
			$('.closeButton').trigger('click');
			let inputBoxColor = getComputedStyle(q('[name=backgroundColor]').raw).getPropertyValue('background-color');
			let nodeColor = getComputedStyle(q('#display_xray').raw).getPropertyValue('background-color')
			let areEqual = inputBoxColor == nodeColor && nodeColor == 'rgb(255, 0, 0)';
			callback('Formatting test', areEqual);
			return areEqual;
		},
		'CPT change/edit': async function(callback) {
			await makeSimplePromise.loadFromServer('bns/Asia.xdsl');
			// Right click 'either'
			$('#display_either').trigger('contextmenu');
			// Click 'Definition' tab
			$('button[data-for=definition]').trigger('click');
			// Change to 'CPT' type
			$('.defType').val('CPT')[0].dispatchEvent(new Event('change'));
			// Change prob
			$('.definition td .prob').eq(0).text("0"); //[0].dispatchEvent(new Event('change'));
			$('.definition td .prob').eq(1).text("1"); //[0].dispatchEvent(new Event('change'));
			$('.definition td .prob').eq(6).text("1"); //[0].dispatchEvent(new Event('change'));
			$('.definition td .prob').eq(7).text("0"); //[0].dispatchEvent(new Event('change'));
			$('.controls [name=save]').trigger('click');
			$(document).trigger('click');
			/// Need a timeout for the change to commit
			await new Promise(r => setTimeout(r, 1000));
			currentBn.iterations = 1000000;
			await new Promise(r => app.updateBn(r));
			var eitherYesProb = Number($('#display_either .state .prob').eq(0).text());
			var areEqual1 = testing.testNumbersEqual('P(Either=Yes)=.999?', eitherYesProb, .999, 0.01);
			callback('CPT change/edit', areEqual1);
			return areEqual1;
		},
		'Undo/Redo': {
			_title: 'Undo/Redo',
			'Add node/remove node': async function(logger) {
				await makeSimplePromise.loadFromServer('bns/Asia.xdsl');
				
				currentBn.guiAddNode('testNODE', ['yes','no'], {pos:{x:400,y:300}, children:['dysp']});
				let equalBefore = testing.testArrayNumsEqual(currentBn.node.dysp.def.cpt, [0.9,0.1,0.9,0.1,0.8,0.2,0.8,0.2,0.7,0.3,0.7,0.3,0.1,0.9,0.1,0.9], 0.001);
				currentBn.changes.undo();
				let equalAfter = testing.testArrayNumsEqual(currentBn.node.dysp.def.cpt, [.9,.1,.8,.2,.7,.3,.1,.9], 0.001);
				return equalBefore && equalAfter
				// currentBn.node.testNODE.guiAddParents(
				//currentBn.changes.undo();
			},
			'Remove node/add node': async function(logger) {
				await makeSimplePromise.loadFromServer('bns/Asia.xdsl');
				
				currentBn.node.bronc.guiDelete();
				let equalBefore = testing.testArrayNumsEqual(currentBn.node.dysp.def.cpt, [.8,.2,.45,.55], 0.001);
				currentBn.changes.undo();
				let equalAfter = testing.testArrayNumsEqual(currentBn.node.dysp.def.cpt, [.9,.1,.8,.2,.7,.3,.1,.9], 0.001);
				return equalBefore && equalAfter
				// currentBn.node.testNODE.guiAddParents(
				//currentBn.changes.undo();
			},
		},
	},

	numbersEqual: function(a, b, epsilon) {
		return Math.abs(a - b) < epsilon;
	},
	testNumbersEqual: function(logEntry, a, b, epsilon) {
		var areEqual = testing.numbersEqual(a, b, epsilon);
		console.log('numbersEqual', a, b, areEqual, logEntry);
		return areEqual;
	},
	testArrayNumsEqual(a, b, epsilon) {
		for (let i=0; i<a.length; a++) {
			let thisVal = a[i];
			let otherVal = b[i];
			if (!this.numbersEqual(thisVal, otherVal, epsilon)) {
				return false;
			}
		}
		return true;
	},
	runTests: async function() {
		var numPassed = 0;
		
		for (var test of testing.tests) {
			var [testName, testResult] = await makeSimplePromise(test);
			if (testResult)  numPassed++;
			console.log('Test '+testName, 'Result:', testResult);
		}
		
		console.log('Tests finished. '+numPassed+'/'+testing.tests.length+' tests passed.');
	},
}

function testHtm() {
	var i = 0;
	var iters = 10000;

	var startTime = performance.now();
	for (i=0; i<iters; i++) {
		let node = qnode('div', 'xxx', {'class': 'gary'});
	}
	console.log(performance.now() - startTime);

	startTime = performance.now();
	for (i=0; i<iters; i++) {
		let node = document.createElement('div');
		node.appendChild( document.createTextNode('xxx') );
		node.className = 'gary';
	}
	console.log(performance.now() - startTime);

	var startTime = performance.now();
	for (i=0; i<iters; i++) {
		let node = qnode('div', 'xxx', {'class': 'gary'});
	}
	console.log(performance.now() - startTime);

	startTime = performance.now();
	for (i=0; i<iters; i++) {
		let node = document.createElement('div');
		node.appendChild( document.createTextNode('xxx') );
		node.className = 'gary';
	}
	console.log(performance.now() - startTime);
}