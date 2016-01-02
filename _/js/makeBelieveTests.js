var testing = {
	tests: [
		/// Basic inference - Asia
		function(callback) {
			loadFromServer('bns/Asia.xdsl', function() {
				var savedIterations = currentBn.iterations;
				currentBn.iterations = 1000000;
				updateBN(function() {
					var xrayYesProb = Number($('#display_xray .state .prob').eq(0).text());
					var areEqual1 = testing.testNumbersEqual('xrayYesProb=0.11?', xrayYesProb, 0.11, 0.005);
					$('#display_dysp .stateName').eq(1).trigger('click');
					updateBN(function() {
						var smokeYesProb = Number($('#display_smoke .state .prob').eq(0).text());
						var areEqual2 = testing.testNumbersEqual('smokeYesProb=0.4?', smokeYesProb, 0.4, 0.05);
						currentBn.iterations = savedIterations;
						callback('Basic Inference - Asia', areEqual1 && areEqual2);
					});
				});
			});
		},
		/// Decision Nets - Umbrella
		function(callback) {
			loadFromServer('bns/Umbrella.xdsl', function() {
				var savedIterations = currentBn.iterations;
				currentBn.iterations = 1000000;
				updateBN(function() {
					var ev = Number($('.status .expectedValue .val').eq(0).text());
					var areEqual1 = testing.testNumbersEqual('EV=78.5?', ev, 78.5, 1);
					$('#display_Weather .stateName').eq(1).trigger('click');
					updateBN(function() {
						var ev = Number($('.status .expectedValue .val').eq(0).text());
						var areEqual2 = testing.testNumbersEqual('EV=95?', ev, 95, 1);
						currentBn.iterations = savedIterations;
						callback('Decision Nets - Umbrella', areEqual1 && areEqual2);
					});
				});
			});
		},
		/// Formatting
		function(callback) {
			loadFromServer('bns/Asia.xdsl', function() {
				$('#display_xray').trigger('contextmenu');
				$('button[data-for=format]').trigger('click');
				$('[data-control=backgroundColor]').val('#ff0000').keyup();
				$('.saveButton').trigger('click');
			});
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

	numPassed: 0,
	runTests: function(i) {
		if (typeof(i)=="undefined") {
			i = 0;
			testing.numPassed = 0;
		}

		if (i<testing.tests.length) {
			testing.tests[i](function(testName, testResult){
				if (testResult)  testing.numPassed++;
				console.log('Test '+testName, 'Result:', testResult);
				testing.runTests(i+1);
			});
		}
		else {
			console.log('Tests finished. '+testing.numPassed+'/'+testing.tests.length+' tests passed.');
		}
	},
}

