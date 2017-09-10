(function(window, stormy) {
	var listeners = {
		startup: [],
	};
	
	function request(url, onSuccess, onFailure) {
		var xhr = new XMLHttpRequest();
		xhr.timeout = 1000;
		xhr.addEventListener("load", function(e) {
			//document.querySelector('textarea').value = xhr.responseText;
			onSuccess(xhr.responseText, xhr, e);
		});
		xhr.addEventListener('timeout', function(e) {
			onFailure('timeout');
		});
		xhr.open("GET", url);
		//xhr.responseType = "document";
		xhr.send();
	}
	
	function post(url, formData, onSuccess) {
		var xhr = new XMLHttpRequest();
		xhr.addEventListener('load', function(e) {
			onSuccess(xhr.responseText, xhr, e);
		});
		xhr.open('POST', url);
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.send(JSON.stringify(formData));
	}
	
	stormy.available = null;
	
	stormy.checkAvailable = function() {
		return new Promise((resolve,reject) => {
			request('http://localhost:26497/available', function(data) {
				if (data == "yes") {
					stormy.available = true;
					resolve(true);
				}
				else {
					stormy.available = false;
					resolve(false);
				}
			}, function(error) {
				stormy.available = false;
				resolve(false);
			});
		});
	}
	
	/** Add event listeners **/
	stormy.on = function(type, callback) {
		var listener = {callback: callback};
		listeners[type].push(listener);
		var onSetupFunc = stormy[`on_${type}`];
		if (onSetupFunc)  onSetupFunc(listener);
	}
	
	/** Specialised listener setup **/
	stormy.on_startup = function(listener) {
		if (stormy.available !== null) {
			listener.callback(stormy.available);
			listener.called = true;
		}
	}
	
	/** Stormy startup function **/
	stormy.startup = async function(force) {
		var avail = await stormy.checkAvailable();
		listeners.startup.filter(l => force || !l.called).forEach(l => stormy.on_startup(l));
	}
	
	stormy.openFileDialog = function() {
		var win = window.open('http://localhost:26497/filepicker/?type=open', 'filepick', 'height=400,width=700,scrollbars=yes');
		return new Promise((resolve, reject) => {
			window.addEventListener('message', function(e) {
				var currentFile = e.data;
				console.log(currentFile);
				request('http://localhost:26497/key/'+currentFile.key+'/details', (text) => {
					var details = Object.assign({fileName: null, format: null}, JSON.parse(text));
					request('http://localhost:26497/key/'+currentFile.key+'/read', (text, xhr, event) => {
						resolve({text, xhr, event, fileName: details.fileName, format: details.format,
							key: currentFile.key});
					});
				});
			}, false);
		});
	}
	
	stormy.saveFileDialog = function(o) {
		o = o || {};
		o.content = o.content || null;
		
		var win = window.open('http://localhost:26497/filepicker/?type=save', 'filepick', 'height=400,width=700,scrollbars=yes');
		return new Promise((resolve, reject) => {
			window.addEventListener('message', function(e) {
				var currentFile = e.data;
				console.log(currentFile);
				request('http://localhost:26497/key/'+currentFile.key+'/read', (text, xhr, event) => {
					if (o.content !== null) {
						stormy.saveFile(currentFile.key, o.content);
					}
					resolve({text, xhr, event, fileName: details.fileName, format: details.format,
							key: currentFile.key});
				});
			}, false);
		});
	}
	
	stormy.saveFile = function(key, content) {
		var formData = {fileContent: content};
		return new Promise((resolve,reject) => {
			post('http://localhost:26497/key/'+key+'/write', formData, (text, xhr, event) => resolve({text, xhr, event}));
		});
	}
	
	/// Check availability on load
	stormy.startup();
})(window, window.stormy = {});