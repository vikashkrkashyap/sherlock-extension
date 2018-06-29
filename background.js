var allowedHost = "samurai.reports.mn";
var urlToRedirect = "http://local.cmadmin-v2.mn/sherlock/#/configurations/add/";

chrome.browserAction.onClicked.addListener(function(tab) {
    var url = new URL(tab.url);
    // var location = url.
    if(url.host === allowedHost) {
        // var pathname = url.pathname;
        var queryString = url.search;
        var namespace = url.pathname.split('reporting/')[1];
        var selection = getUrlParameter(queryString, 'selection');
        var samuraiData = LZString.decompressFromBase64(selection);
        samuraiData = JSON.parse(samuraiData);
        var metricLength = samuraiData.values.length;

        if(metricLength !== 1){
            alert('Exactly one measure should be present');
            return false;
        }

        var configuration = prepareConfiguration(samuraiData, namespace);
        console.log(configuration);
        if(configuration.metric){
            var base64Configuration = LZString.compressToBase64(JSON.stringify(configuration));

            // wrapping the base 64 with square bracket ([]), because while decoding some string is coming as [];
            var formatBase64Configuration = base64Configuration.replace(/[/]/g, '$');
            console.log(formatBase64Configuration);

            window.open(urlToRedirect+formatBase64Configuration,'_blank');
            // window.close();
        }
        else {
            alert('Some error occurred in chrome extension');
        }

    }
    else {
        alert('Sherlock extension is not supported on this page');
    }
});

var getUrlParameter = function (queryString, searchKey) {
    searchKey = searchKey.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + searchKey + '=([^&#]*)');
    var results = regex.exec(queryString);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
};

var prepareConfiguration = function(samuraiData, namespace){

    var configuration = {
        id : null,
        metric : {},
        filters: [],
        splits : [],
        subscribers : {},
        threshold: null,
        showMetricData : {
            collapsedFilters : [],
            formula : null
        }
    };

    var metricString = samuraiData.values[0];
    var metricDetails = {};
    var filters = [];
    var constraints = null;
    var hasCustomMeasure = typeof samuraiData.customMeasures !== 'undefined' && samuraiData.customMeasures.length;

    if(typeof metricString.tables !== 'undefined' || hasCustomMeasure){
        // correlation
        if(hasCustomMeasure || (typeof metricString.formula === 'undefined' && metricString.tables.length)){

            var metricFormula = metricString.id;

            if(hasCustomMeasure){
                metricFormula = samuraiData.customMeasures[0].parsedFormula;
            }

            console.log('metric formula printing');
            console.log(metricFormula);
            var formattedMetrics = formatFromCurlyBraces(metricFormula);
            configuration.metric = {
                type : 'correlation',
                namespace :  namespace,
                metricType : 'Correlation',
                metricName : metricString.label,
                numeratorKonomMetric : formattedMetrics[0],
                denominatorKonomMetric : formattedMetrics[1]
            };
            constraints  = getConstraints(samuraiData, metricString.id);
            configuration.splits = constraints.splits;
            configuration.filters = constraints.filters;
            configuration.showMetricData.collapsedFilters = constraints.collapsedFilters;
            configuration.showMetricData.formula = formatFormula(metricFormula);
        }
        else {
            alert('This measure is not supported for creating the configuration till now');
            return false;
        }
    }
    else {
        console.log('else');
        // singular
        configuration.metric = {
            type : 'singular',
            namespace :  namespace,
            metricType : 'Singular',
            metricName : metricString.label,
            konomMetric : metricString.id
        };

        constraints  = getConstraints(samuraiData, metricString.id);
        configuration.splits = constraints.splits;
        configuration.filters = constraints.filters;
        configuration.showMetricData.collapsedFilters = constraints.collapsedFilters
    }

    return configuration;
};

var formatFromCurlyBraces = function(str){
    var found = [],          // an array to collect the strings that are found
        rxp = /{([^}]+)}/g,
        curMatch;

    while(curMatch = rxp.exec(str) ) {
        found.push( curMatch[1] );
    }

    return found;
};

var formatFormula = function(str){
    var regex = /[{$}]/g;

    return str.replace(regex, '')
};

var getConstraints = function(samuraiData, konomMetric){

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

            if(row.id === 'Time') continue;
            constraints.splits.push({
                type : 'criteria',
                selectionMetric : konomMetric,
                threshold : row.threshold,
                entityName : row.id
            });

            splitNames.push(row.id);
        }
    }

    if(samuraiData.filters.length) {
        var samuraiFilters = samuraiData.filters;
        for(var filterKey in samuraiFilters){
            if(!samuraiFilters.hasOwnProperty(filterKey)) continue;
            var samuraiFilter = samuraiFilters[filterKey];

            if(samuraiFilter.id === 'Time') continue;

            constraints.collapsedFilters.push({
                label : samuraiFilter.id,
                values : samuraiFilter.data.values,
                isPivot : splitNames.indexOf(samuraiFilter.id) !== -1
            });

            for(var value in samuraiFilter.data.values){
                if(!samuraiFilter.data.values.hasOwnProperty(value)) continue;
                var filterValue = samuraiFilter.data.values[value];

                constraints.filters.push({
                    type : 'specific',
                    entityName : samuraiFilter.id,
                    entityValue : filterValue
                });
            }
        }
    }

    return constraints;
};