var supportedHosts = {
    samurai : "samurai.reports.mn",
    grafana :  "graphite.srv.media.net"
};

// Local
// var dashBoardBaseUrl = "http://local.sherlock-admin.mn";

// Production
var dashBoardBaseUrl = "https://sherlock.reports.mn";

chrome.browserAction.onClicked.addListener(function(tab) {

    var url = new URL(tab.url);
    var hostname = url.hostname;

    // Samurai
    if(hostname === supportedHosts.samurai){
        var queryString = url.search;
        var selection = util.getUrlParam(queryString, 'selection');
        var samuraiData = LZString.decompressFromBase64(selection);
        samuraiData = JSON.parse(samuraiData);
        configuration('samurai', samuraiData, tab);
    }
    // Grafana
    else if(hostname.indexOf(supportedHosts.grafana) !== -1){

        var data = util.getUrlParam(url.search, 'target');
        configuration('grafana', data, tab)
    }
    else {
        alert('Sherlock extension is not supported on this page');
    }
});

var configuration = function(type, data, tab){

    var configuration = {};

    switch (type)
    {
        case 'samurai':
            prepareConfig.samurai(data, tab);
            break;

        case 'grafana':
            prepareConfig.grafana(data, tab);
            break;
    }

    return configuration;
};

var prepareConfig = {

    samurai : function(data, tab){

        // Validate
        if(data.values.length !== 1){
            alert('Exactly one measure should be present');
            return false;
        }

        // Create configuration
        var metricString = data.values[0];
        var url = new URL(tab.url);
        var namespace = url.pathname.split('reporting/')[1];

        var configuration = {
            name : null,
            namespace : decodeURI(namespace),
            datasource : 'Samurai',
            url : url.href,
            threshold : 50,
            trend : "drop",
            track : "gradual",
            metric : {
                name : null,
                formula : null
            },
            filters : [],
            splits : []
        };


        var constraints = null;
        var hasCustomMeasure = typeof data.customMeasures !== 'undefined' && data.customMeasures.length;

        // Custom measure
        if(typeof metricString.tables !== 'undefined' || hasCustomMeasure){
            if(hasCustomMeasure || (typeof metricString.formula === 'undefined' && metricString.tables.length)){

                var metricFormula = metricString.id;

                if(hasCustomMeasure){
                    metricFormula = data.customMeasures[0].parsedFormula;
                }

                constraints  = util.samurai.constrains(data);

                configuration.metric.name = metricString.label;
                configuration.metric.formula = metricFormula;
                configuration.splits = constraints.splits;
                configuration.filters = constraints.filters;
            }
            else {
                alert('This measure is not supported yet for creating the configuration');
                return false;
            }
        }
        else {
            // Singular
            constraints  = util.samurai.constrains(data);
            configuration.metric.name = metricString.label;
            configuration.metric.formula = metricString.id;
            configuration.splits = constraints.splits;
            configuration.filters = constraints.filters;
        }

        util.redirectToDashboard(configuration, '/create-config');
    },

    grafana : function(data, tab){
        var grafanaDataString = util.grafana.formatDataString(data);

        if(typeof grafanaDataString === 'undefined' || grafanaDataString.length === 0){
            alert('Invalid data string');
            return false;
        }

        var constraints = grafanaDataString.split('.');
        var url = new URL(tab.url);
        var namespace = url.origin+url.pathname;

        var configuration = {
            name : null,
            namespace : decodeURI(namespace),
            datasource : 'Grafana',
            threshold : 50,
            trend : "drop",
            track : "gradual",
            query : util.grafana.getQuery(data),
            metric : {
                name : null,
                formula : null
            },
            filters : [],
            splits : []
        };

        for (var index = 0; index < constraints.length; index++)
        {
            if(index === constraints.length-1){
                configuration.metric.name = configuration.metric.formula = constraints[index];
                break;
            }

            if(constraints[index] === '*'){
                configuration.splits.push({
                    name : "TreeLevel-"+(index+1),
                    limit : 0
                })
            }
            else {
                configuration.filters.push({
                    type : 'include',
                    name : 'TreeLevel-'+(index+1),
                    values : [constraints[index]]
                });
            }
        }
        util.redirectToDashboard(configuration, '/create-config')
    }
};

var util = {
    /**
     * @param values | array
     * @returns {*}
     */

    selectRandomFromList : function (values){
        return values[Math.floor(Math.random() * (values.length))];
    },

    getUrlParam : function (queryString, searchKey) {
        searchKey = searchKey.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
        var regex = new RegExp('[\\?&]' + searchKey + '=([^&#]*)');
        var results = regex.exec(queryString);
        return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
    },

    redirectToDashboard : function(configuration, path){
        var urlToRedirect = dashBoardBaseUrl + path;
        var encodedConfiguration = encodeURIComponent(LZString.compressToBase64(JSON.stringify(configuration)))
        window.open(urlToRedirect+'?config='+encodedConfiguration,'_blank');
    },

    // samurai specific utils
    samurai : {
        constrains : function(samuraiData){

            var constraints = {
                filters : [],
                splits : [],
                collapsedFilters : []
            };

            if(samuraiData.rows.length){
                var splitNames = [];
                var rows = samuraiData.rows;
                for(var key in rows){
                    if(!rows.hasOwnProperty(key)) continue;
                    var row = rows[key];

                    // ignore time splits
                    if(row.id === 'Time') continue;

                    constraints.splits.push({
                        name : row.id,
                        limit : row.threshold
                    });

                    splitNames.push(row.id);
                }
            }

            if(samuraiData.filters.length) {
                var samuraiFilters = samuraiData.filters;
                for(var filterKey in samuraiFilters){
                    if(!samuraiFilters.hasOwnProperty(filterKey)) continue;
                    var samuraiFilter = samuraiFilters[filterKey];

                    // ignore time filters
                    if(samuraiFilter.id === 'Time') continue;

                    constraints.filters.push({
                        type : samuraiFilter.data.filterType,
                        name : samuraiFilter.id,
                        values : samuraiFilter.data.data
                    });
                }
            }

            return constraints;
        }
    },

    // grafana specific utils
    grafana : {
        formatDataString : function (string) {
            return string.match(/\((.*?),/)[1];
        },

        getQuery : function(string){
            string =  string.replace('"1hour"', '"${granularity}"');
            return "?target="+string;
        }
    }

};