var supportedHosts = {
    samurai : "samurai.reports.mn",
    grafana :  "graphite.srv.media.net"
};

// Local
var dashBoardBaseUrl = "http://local.sherlock-admin.mn/api/v1";

// Production
// var dashBoardBaseUrl = "https://sherlock.reports.mn/api/v1";

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
            metrics : {},
            filters : [],
            splits : [],
            formula : null
        };


        var constraints = null;
        var metricFormula = null;
        var hasCustomMeasure = typeof data.customMeasures !== 'undefined' && data.customMeasures.length;
        var hasFilterMeasure = typeof data.filteredMeasures !== 'undefined' && data.filteredMeasures && data.filteredMeasures.length;

        // Custom measure
        if(typeof metricString.tables !== 'undefined' || hasCustomMeasure){
            if(hasCustomMeasure || (typeof metricString.formula === 'undefined' && metricString.tables.length)){
                metricFormula = metricString.id;

                if(hasCustomMeasure){
                    metricFormula = data.customMeasures[0].parsedFormula;
                }

                constraints = util.samurai.constrains(data);
            }
            else {
                alert('This measure is not supported yet for creating the configuration');
                return false;
            }
        }
        else {
            metricFormula = metricString.id;
            if(hasFilterMeasure){
                metricFormula = metricString.alias;
            }

            constraints = util.samurai.constrains(data);
        }

        configuration.name = metricString.label;
        configuration.metrics = util.samurai.getMetrics(data);
        configuration.splits = constraints.splits;
        configuration.filters = constraints.filters;
        configuration.formula = util.samurai.getFormula(configuration.metrics, metricFormula);

        util.redirectToDashboard(configuration, '/util/create-config');
        // util.redirectToCmDashboard(configuration);
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
        var metricData = [];

        var configuration = {
            name : null,
            namespace : decodeURI(namespace),
            datasource : 'Grafana',
            threshold : 50,
            trend : "drop",
            track : "gradual",
            query : util.grafana.getQuery(data),
            metrics : {},
            filters : [],
            splits : [],
            formula : null
        };

        for (var index = 0; index < constraints.length; index++)
        {
            if(index === constraints.length-1){
                metricData.push(constraints[index]);

                // todo :: remove metric name assignment when multiple metric is supported for grafana
                configuration.name = constraints[index];
                configuration.metrics = util.grafana.getMetrics(metricData);
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

        configuration.formula = util.grafana.getFormula(configuration.metrics);

        console.log(configuration);
        util.redirectToDashboard(configuration, '/util/create-config')
        // util.redirectToCmDashboard(configuration);
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

    redirectToCmDashboard : function(configuration){
        var encodedConfiguration = LZString.compressToBase64(JSON.stringify(configuration));
        encodedConfiguration = encodedConfiguration.replace(/\//g, '$');
        var urlToRedirect = 'http://local.cmadmin-v2.mn/sherlock/#/configurations/add/'+encodedConfiguration;
       window.open(urlToRedirect,'_blank');
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
        },

        getMetrics : function(data){
            var metrics = {};
            var index = 1;
            var hasFilterMeasure = typeof data.filteredMeasures !== 'undefined' && data.filteredMeasures && data.filteredMeasures.length;

            // for custom measure
            if(typeof data.customMeasures !== 'undefined' && data.customMeasures.length){
                // check if metric has filters
                    index = 1;

                    var entityMaps = data.customMeasures[0].formula.entityMap;
                    for(var customMeasure in  entityMaps){
                        if(!entityMaps.hasOwnProperty(customMeasure)) continue;

                        var metricIndex = index.toString();
                        metrics[metricIndex] = {
                            name : entityMaps[customMeasure].data.mention.id,
                            formulaName : entityMaps[customMeasure].data.mention.id,
                            filters : []
                        };

                        if(hasFilterMeasure){
                            data.filteredMeasures.forEach(function(filterMeasure){

                                if(metrics[metricIndex].name === filterMeasure.id && filterMeasure.filters.length){

                                    filterMeasure.filters.forEach(function(filter){
                                        metrics[metricIndex].name = filterMeasure.alias;
                                        metrics[metricIndex].filters.push({
                                            type : filter.item.data.filterType,
                                            name : filter.item.data.dimension,
                                            values : filter.item.data.values
                                        });
                                    });
                                }
                            });
                        }

                        index++;
                    }
            }

            // for single metric
            else {

                if(hasFilterMeasure){
                    metrics = util.samurai.getMetricsFromFilterMeasures(data);
                }
                else {
                    var formula = data.values[0].id;

                    metrics[index.toString()] = {
                        name : formula,
                        filters : []
                    }
                }
            }

            return metrics;
        },
        getFormula : function(metrics, formula){

            if(metrics.length === 0) return null;

            // for single metric
            if(formula.indexOf('{') === -1){
                return "${1}";
            }

            // for metric with formula
            var index = 0;
            for(var metricKey in metrics){
                if(metrics.hasOwnProperty(metricKey)){
                    formula = formula.replace(metrics[metricKey].formulaName, (++index).toString());
                    delete metrics[metricKey].formulaName;
                }
            }

            return formula;
        },

        getMetricsFromFilterMeasures : function(data){
            var index = 1;
            var metrics = {};

            data.filteredMeasures.forEach(function(filterMeasure){
                var metricIndex = index.toString();
                metrics[metricIndex] = {
                    name : filterMeasure.alias,
                    filters : []
                };

                if(filterMeasure.filters.length){
                    filterMeasure.filters.forEach(function(filter){
                        metrics[metricIndex].filters.push({
                            type : filter.item.data.filterType,
                            name : filter.item.data.dimension,
                            values : filter.item.data.values
                        });
                    });
                }

                index++;
            });

            return metrics;
        }
    },

    // grafana specific utils
    grafana : {
        formatDataString : function (string) {
            return string.match(/\((.*?),/)[1];
        },

        getQuery : function(string){
            string = "target=summarize(${level_wise_filters_or_split.metric},%22${granularity}%22)";
            return string;
        },

        getMetrics : function(metricData){

            console.log(metricData);
            var index = 1;
            metrics = {};

            metricData.forEach(function(metric){
                metrics[(index++).toString()] = {
                    name : metric,
                    filters : []
                };
            });

            return metrics;
        },
        getFormula : function(metrics){

            // todo :: change the logic when multiple metric will be there, for now just hardcoding things

            return "${1}"
            // if(metrics.length === 0) return null;
            //
            // var index = 0;
            // for(var metricKey in metrics){
            //     if(metrics.hasOwnProperty(metricKey)){
            //         formula = formula.replace(metrics[metricKey].name, (++index).toString());
            //     }
            // }
            //
            // return formula;
        }
    }

};