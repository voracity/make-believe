var mb = require("./_/js/makeBelieve.js");

var bn = new mb.BN({source: `<?xml version="1.0" encoding="ISO-8859-1"?>
<smile version="1.0" id="TakeUmbrellaProblem" numsamples="1000" discsamples="10000">
	<nodes>
		<cpt id="Weather">
			<state id="Rain" />
			<state id="NoRain" />
			<probabilities>0.3 0.7</probabilities>
		</cpt>
		<cpt id="Forecast">
			<state id="Sunny" />
			<state id="Cloudy" />
			<state id="Rainy" />
			<parents>Weather</parents>
			<probabilities>0.05 0.15 0.8 0.5 0.3 0.2</probabilities>
		</cpt>
		<decision id="Umbrella">
			<state id="Take" />
			<state id="DoNotTake" />
			<parents>Forecast</parents>
		</decision>
		<utility id="Hapiness">
			<parents>Weather Umbrella</parents>
			<utilities>80 0 90 100</utilities>
		</utility>
	</nodes>
	<extensions>
		<genie version="1.0" app="GeNIe 2.1.380.0" name="Deciding wether to take or not to take the umbrella" faultnameformat="nodestate">
			<comment>A simple Influence Diagram</comment>
			<node id="Weather">
				<name>State of the Weather</name>
				<interior color="e5f6f7" />
				<outline color="0000bb" />
				<font color="000000" name="Arial" size="8" />
				<position>245 141 361 178</position>
				<comment>Will it Rain?</comment>
				<barchart active="true" width="128" height="64" />
			</node>
			<node id="Forecast">
				<name>Weather Forecast for the day of the week</name>
				<interior color="e5f6f7" />
				<outline color="0000bb" />
				<font color="000000" name="Arial" size="8" />
				<position>152 21 257 57</position>
				<barchart active="true" width="128" height="72" />
			</node>
			<node id="Umbrella">
				<name>Take Umbrella?</name>
				<interior color="e5f6f7" />
				<outline color="0000bb" />
				<font color="000000" name="Arial" size="8" />
				<position>36 141 126 177</position>
				<comment>To take or not to take. That is the question.</comment>
				<barchart active="true" width="128" height="64" />
			</node>
			<node id="Hapiness">
				<name>Total Hapiness</name>
				<interior color="e5f6f7" />
				<outline color="0000bb" />
				<font color="000000" name="Arial" size="8" />
				<position>154 262 253 297</position>
				<comment>Am I Happy?</comment>
				<barchart active="true" width="128" height="64" />
			</node>
			<textbox>
				<caption>A run of the mill umbrella problem with a weather forecast.\n\nThe probabilities and utilities are invented for the purpose of demonstration.</caption>
				<font color="3366ff" name="Arial" size="10" bold="true" align="right" />
				<position>407 138 603 250</position>
			</textbox>
		</genie>
	</extensions>
</smile>
`});


console.apilog("Create new network");
var bn = new mb.BN();
bn.iterations = 100000;

console.apilog("Add a new node");
var pollutionNode = bn.addNode("Pollution", ["Low", "High"], {cpt: [.9, .1]});
console.apilog("Network nodes:", bn.nodes.map(n => n.id));

console.apilog("Add a second node");
var cancerNode = bn.addNode("Cancer", ["Absent", "Present"], {parents: [pollutionNode], cpt: [.3,.7, .2,.8, .05,.95]});
console.apilog("Network nodes:", bn.nodes.map(n => n.id));
console.apilog("Cancer parents:", cancerNode.parents.map(n => n.id));

console.apilog("Update beliefs");
/// We don't have workers enabled, so this is fine
bn.updateBeliefs();
//function() {
console.apilog("Cancer probs:", cancerNode.beliefs);
//});

console.apilog("Add nodes for Smoker, XRay and Dyspneoa")
bn.addNode("Smoker", ["Yes","No"], {cpt: [.3, .7]})
var xrayNode = bn.addNode("XRay", ["Positive", "Negative"])
var dyspNode = bn.addNode("Dyspnoea", ["Yes", "No"])

console.apilog("Add links for all the new nodes to cancer")
cancerNode.addParents(["Smoker"])
cancerNode.addChildren(["XRay","Dyspnoea"])

console.apilog("Set all the CPTs")
cancerNode.cpt = [.03,        0.97,         // low       True
		   0.001,       0.999,        // low       False
		   0.05,        0.95,         // high      True
		   0.02,        0.98]
xrayNode.cpt = [0.9,         0.1,          // True
		   0.2,         0.8];
dyspNode.cpt = [0.65,        0.35,         // True
		   0.3,         0.7];

bn.updateBeliefs();
console.apilog("Cancer probs:", cancerNode.beliefs);
