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

var testing = {
	tests: [
		/// Basic inference - Asia
		async function(callback) {
			await makeSimplePromise.loadFromServer('bns/Asia.xdsl');
			var savedIterations = currentBn.iterations;
			currentBn.iterations = 1000000;
			
			await makeSimplePromise.updateBN();
			var xrayYesProb = Number($('#display_xray .state .prob').eq(0).text());
			var areEqual1 = testing.testNumbersEqual('xrayYesProb=0.11?', xrayYesProb, 0.11, 0.005);
			$('#display_dysp .stateName').eq(1).trigger('click');
			
			await makeSimplePromise.updateBN();
			var smokeYesProb = Number($('#display_smoke .state .prob').eq(0).text());
			var areEqual2 = testing.testNumbersEqual('smokeYesProb=0.4?', smokeYesProb, 0.4, 0.05);
			currentBn.iterations = savedIterations;
			
			callback('Basic Inference - Asia', areEqual1 && areEqual2);
		},
		/// Decision Nets - Umbrella
		async function(callback) {
			await makeSimplePromise.loadFromServer('bns/Umbrella.xdsl');
			var savedIterations = currentBn.iterations;
			currentBn.iterations = 1000000;

			await makeSimplePromise.updateBN();
			var ev = Number($('.status .expectedValue .val').eq(0).text());
			var areEqual1 = testing.testNumbersEqual('EV=78.5?', ev, 78.5, 1);
			$('#display_Weather .stateName').eq(1).trigger('click');

			await makeSimplePromise.updateBN();
			var ev = Number($('.status .expectedValue .val').eq(0).text());
			var areEqual2 = testing.testNumbersEqual('EV=95?', ev, 95, 1);
			currentBn.iterations = savedIterations;
			callback('Decision Nets - Umbrella', areEqual1 && areEqual2);
		},
		/// Submodels - Bunce's Farm
		async function(callback) {
			await makeSimplePromise.loadFromServer('bns/Bunce\'s Farm.xdsl');
			var savedIterations = currentBn.iterations;
			currentBn.iterations = 1000000;

			await makeSimplePromise.updateBN();
			var ev = Number($('.status .expectedValue .val').eq(0).text());
			var areEqual1 = testing.testNumbersEqual('EV=48?', ev, -48, 1);
			callback('Submodels - Bunce\'s Farm', areEqual1);
			/*$('#display_Weather .stateName').eq(1).trigger('click');
			updateBN(function() {
				var ev = Number($('.status .expectedValue .val').eq(0).text());
				var areEqual2 = testing.testNumbersEqual('EV=95?', ev, 95, 1);
				currentBn.iterations = savedIterations;
				callback('Decision Nets - Umbrella', areEqual1 && areEqual2);
			});*/
		},
		/// Formatting
		async function(callback) {
			await makeSimplePromise.loadFromServer('bns/Asia.xdsl');
			$('#display_xray').trigger('contextmenu');
			$('button[data-for=format]').trigger('click');
			$('[data-control=backgroundColor]').val('#ff0000').keyup();
			$('.saveButton').trigger('click');
			$('.closeButton').trigger('click');
			callback('Formatting test', true);
		},
		/// CPT change/edit
		async function(callback) {
			await makeSimplePromise.loadFromServer('bns/Asia.xdsl');
			// Right click 'either'
			$('#display_either').trigger('contextmenu');
			// Click 'Definition' tab
			$('button[data-for=definition]').trigger('click');
			// Change to 'CPT' type
			$('.definitionType').val('CPT').trigger('change');
			// Change prob
			$('.definition .prob:nth(0)').text("0").trigger('change');
			$('.definition .prob:nth(1)').text("1").trigger('change');
			$('.definition .prob:nth(6)').text("1").trigger('change');
			$('.definition .prob:nth(7)').text("0").trigger('change');
			$('.saveButton').trigger('click');
			$('.closeButton').trigger('click');
			/// Need a timeout for the change to commit
			await new Promise(r => setTimeout(r, 1000));
			currentBn.iterations = 1000000;
			await makeSimplePromise.updateBN();
			var eitherYesProb = Number($('#display_either .state .prob').eq(0).text());
			var areEqual1 = testing.testNumbersEqual('P(Either=Yes)=.999?', eitherYesProb, .999, 0.01);
			callback('CPT change/edit', areEqual1);
		},
	],

	numbersEqual: function(a, b, epsilon) {
		return Math.abs(a - b) < epsilon;
	},
	testNumbersEqual: function(logEntry, a, b, epsilon) {
		var areEqual = testing.numbersEqual(a, b, epsilon);
		console.log('numbersEqual', a, b, areEqual, logEntry);
		return areEqual;
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