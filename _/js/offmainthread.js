(function(global) {
	let worker = new Worker("_/js/offmainthread_worker.js");
	let listener = {
		listeners: {},
		on(id, func) {
			this.listeners[id] = func;
		},
		handle(obj) {
			this.listeners[obj.id](obj.result);
			delete this.listeners[obj.id];
		},
	};

	worker.onmessage = e => listener.handle(e.data);

	let offmain = {
		run(funcStr, ...args) {
			return new Promise((resolve,reject) => {
				let id = Math.random();
				funcStr = typeof(funcStr)=="function" ? funcStr.toString() : funcStr;
				worker.postMessage({type: 'runFunction', funcStr, args, id});
				listener.on(id, result => resolve(result));
			});
		},

		async test() {
			let val = await this.run((a,b) => a+b, 5, 10);
			console.log(val);
		},
	};

	global.offmain = offmain;
})(window || global);