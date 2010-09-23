var WDMMG = {};

WDMMG.CONFIG = {
	'dataStoreApi': 'http://data.wheredoesmymoneygo.org/api',
	'breakdownIdentifier': 'slice=cra&breakdown-from=yes&breakdown-region=yes',
	// 'visualizationType': 'sunburst'
	'visualizationType': 'nodelink',
	// ordered list of keys (used in displaying the spending)
	'breakdownKeys': [ 'from', 'region' ],
	// 'breakdownKeys': [ 'region', 'from' ],
	'year': 2008,
}

WDMMG.DATA_CACHE = {
	'breakdown': {
	},
	'keys': {
	}
}
WDMMG.sunburst = {};

$(document).ready(function() {
	var callback = WDMMG.sunburst.render;
	// department then region
	WDMMG.sunburst.loadData(callback);
	// TODO: set checked on page (at start) based on visualizationType or vice-versa 
	$("#controls .vis-type input").click(function(e) {
		// radio, so only one
		var vistype = $('div.vis-type').find('input:checked');
		vistype = $($(vistype)[0]).attr('value');
		WDMMG.CONFIG.visualizationType = vistype;
		WDMMG.sunburst.render();
	});

    $("#slider").slider({
      value: WDMMG.CONFIG.year,
      min: 2004,
      max: 2010,
      step: 1,
      slide: function(event, ui) {
        $("#year").text(ui.value);
		WDMMG.CONFIG.year = ui.value;
		WDMMG.sunburst.render();
      }
    });
    $("#year").text($("#slider").slider("value"));
});

WDMMG.sunburst.loadData = function(callback) {
	if (DEBUG) {
		WDMMG.DATA_CACHE['breakdown'][WDMMG.CONFIG.breakdownIdentifier] = dept_region;
		WDMMG.DATA_CACHE['keys']['from'] = key_from['enumeration_values'];
		WDMMG.DATA_CACHE['keys']['region'] = key_region['enumeration_values'];
		callback();
	} else {
		var api_url = WDMMG.CONFIG.dataStoreApi + '/aggregate?' + WDMMG.CONFIG.breakdownIdentifier + '&callback=?';
		$.getJSON(api_url, function(data) {
			WDMMG.DATA_CACHE['breakdown'][WDMMG.CONFIG.breakdownIdentifier] = data;
			// need to do work to ensure we only call render after *all* data loaded
			var done = 2; // number of total requests
			$.each(data.metadata.axes, function(i,key) {
				var api_url = WDMMG.CONFIG.dataStoreApi + '/rest/key/' + key + '?callback=?';
				$.getJSON(api_url, function(data) {
					WDMMG.DATA_CACHE['keys'][key] = data['enumeration_values'];
					done -= 1;
					if(done == 0) {
						callback();
					}
				});
			});
		});
	}
}

WDMMG.sunburst.render = function () {
	var nodes = WDMMG.sunburst.getNodes()
	var vistype = WDMMG.CONFIG.visualizationType;
	if (vistype == 'sunburst') {
		WDMMG.sunburst.sunburst(nodes);
	} else if (vistype == 'nodelink') {
		WDMMG.sunburst.nodelink(nodes);
	} else {
		alert('Visualization type not recognized ' + vistype);
	}
}

WDMMG.sunburst.getNodes = function (breakdownIdentifier) {
	var wdmmg_data = WDMMG.DATA_CACHE['breakdown'][WDMMG.CONFIG.breakdownIdentifier];
	var years = $.map(wdmmg_data.metadata.dates, function(year, idx) {
			return year.substring(0,4);
	});
	var yearIdx = years.indexOf(String(WDMMG.CONFIG.year));
	var year = wdmmg_data.metadata.dates[yearIdx];
	var hierarchy = WDMMG.CONFIG.breakdownKeys;
	var keyToIdx = {} 
	$.each(wdmmg_data.metadata.axes, function(idx, key){
		keyToIdx[key] = idx;
	});
	var idxToKey = {};
	$.each(wdmmg_data.metadata.axes, function(idx, key){
		idxToKey[idx] = key;
	});
	var tree = pv.tree(wdmmg_data.results)
		.keys(function(d) {
				var labels = $.map(hierarchy, function(k,idx) {
					var code = d[0][keyToIdx[k]];
					return WDMMG.DATA_CACHE.keys[k][code]['name'];
				});
				return labels;
			})
		.value(function(d) {return d[1][yearIdx]})
		.map();
	var dom = pv.dom(tree);
	var nodes = dom.root("Total Spending " + year).nodes();
	return nodes;
}

WDMMG.sunburst.sunburst = function (data) {
	var vis = new pv.Panel()
		.width(700)
		.height(600)
		.canvas('fig')
		;

	var partition = vis.add(pv.Layout.Partition.Fill)
		.nodes(data)
		.size(function(d) {return d.nodeValue})
		.order("descending")
		.orient("radial");

	partition.node.add(pv.Wedge)
		.fillStyle(pv.Colors.category19().by(function(d) {return d.parentNode && d.parentNode.nodeName}))
		.strokeStyle("#fff")
		.lineWidth(.5)
		.title(function(d) {
			var t = '';
			// only 2nd layer ring
			if (d.depth > 0.5 ) {
				var t = d.parentNode.nodeName + ' - ';
			}
			var t = t + d.nodeName + ' GBP ' + numberAsString(d.size);
			return t;
			})
		.event("mouseover", pv.Behavior.tipsy({gravity: "w", fade: true}));
		;

	partition.label.add(pv.Label)
		.visible(function(d) {
			// depth 0 for root, 0.5 for first ring, 1 for 2nd ring
			return d.angle * d.outerRadius >= 50 && d.depth <= 0.5
			})
		;

	vis.render();
}

WDMMG.sunburst.nodelink = function (nodes) {
	var vis = new pv.Panel()
		.width(700)
		.height(600)
		.canvas('fig')
		;

	var tree = vis.add(pv.Layout.Tree)
		.nodes(nodes)
		.depth(140)
		.breadth(5)
		.orient("radial")
		;

	tree.link.add(pv.Line);

	function nodeval(node) {
		var selfval = 0;
		if (node.nodeValue) {
			selfval = node.nodeValue;
		}
		return selfval + pv.sum(node.childNodes, nodeval);
	}

	function dotSize(node) {
		var selfval = nodeval(node);
		// divide by 0.5 billion
		return selfval / (0.5 * 1000000 * 1000);
	}

	tree.node.add(pv.Dot)
		.fillStyle(function(n) {
			return n.firstChild ? "#aec7e8" : "#ff7f0e"
			})
		.title(function(d) {
			var selfval = nodeval(d);
			var t = '';
			// only 2nd layer ring
			if (d.depth > 0.5 ) {
				var t = d.parentNode.nodeName + ' - ';
			}
			var t = t + d.nodeName + ' GBP ' + numberAsString(selfval);
			return t;
			})
		.size(function(d) {
			return dotSize(d);
			})
		.visible(function(d) {
				// remove all leaf nodes
				// return d.childNodes.length > 0;
				// return dotSize(d) > 5;
				return true;
			})
		;
	
	tree.label.add(pv.Label)
		.visible(function(d) {
			return d.parentNode == null;
			})
		;

	vis.render();
}