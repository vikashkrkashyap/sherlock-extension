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

        var configuration = prepareConfigurationForSamurai(samuraiData, namespace);
        if(configuration.metric){

            // console.log(configuration);
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'http://local.sherlock-admin.mn/api/v1/samurai/configuration/add', true);
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.send(JSON.stringify(configuration));

            xhr.onload = function () {
                if(xhr.status === 200){
                    alert('Configuration created successfully');
                }
                else {
                    var responseText = xhr.responseText;

                    try{
                        response = JSON.parse(responseText);
                        if(response.httpCode == 422 && response.error){
                            alert(response.error);
                        }
                        else {
                            alert('Some error occurred, unable to create config');
                        }
                    }
                    catch(err){
                        alert('Some error occurred, unable to create config');
                    }
                }

                // var response = xhr.responseText;
                // console.log(xhr.responseText);
            };
            //
            // function post(path, params, method) {
            //     method = method || "post"; // Set method to post by default if not specified.
            //     // The rest of this code assumes you are not using a library.
            //     // It can be made less wordy if you use one.
            //     var form = document.createElement("form");
            //
            //     form.setAttribute("method", method);
            //     form.setAttribute("action", path);
            //     for(var key in params) {
            //         if(params.hasOwnProperty(key)) {
            //             var hiddenField = document.createElement("input");
            //             hiddenField.setAttribute("type", "hidden");
            //             hiddenField.setAttribute("name", key);
            //             hiddenField.setAttribute("value", JSON.stringify(params[key]));
            //             form.appendChild(hiddenField);
            //         }
            //     }
            //     document.body.appendChild(form);
            //     form.submit();
            // }
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

// var prepareConfiguration = function(samuraiData, namespace){
//
//     var configuration = {
//         id : null,
//         metric : {},
//         filters: [],
//         splits : [],
//         subscribers : {},
//         threshold: null,
//         showMetricData : {
//             collapsedFilters : [],
//             formula : null
//         }
//     };
//
//     var metricString = samuraiData.values[0];
//     var metricDetails = {};
//     var filters = [];
//     var constraints = null;
//     var hasCustomMeasure = typeof samuraiData.customMeasures !== 'undefined' && samuraiData.customMeasures.length;
//
//     if(typeof metricString.tables !== 'undefined' || hasCustomMeasure){
//         // correlation
//         if(hasCustomMeasure || (typeof metricString.formula === 'undefined' && metricString.tables.length)){
//
//             var metricFormula = metricString.id;
//
//             if(hasCustomMeasure){
//                 metricFormula = samuraiData.customMeasures[0].parsedFormula;
//             }
//
//             console.log('metric formula printing');
//             console.log(metricFormula);
//             var formattedMetrics = formatFromCurlyBraces(metricFormula);
//             configuration.metric = {
//                 type : 'correlation',
//                 namespace :  namespace,
//                 metricType : 'Correlation',
//                 metricName : metricString.label,
//                 numeratorKonomMetric : formattedMetrics[0],
//                 denominatorKonomMetric : formattedMetrics[1]
//             };
//             constraints  = getConstraints(samuraiData, metricString.id);
//             configuration.splits = constraints.splits;
//             configuration.filters = constraints.filters;
//             configuration.showMetricData.collapsedFilters = constraints.collapsedFilters;
//             configuration.showMetricData.formula = formatFormula(metricFormula);
//         }
//         else {
//             alert('This measure is not supported for creating the configuration till now');
//             return false;
//         }
//     }
//     else {
//         // singular
//         configuration.metric = {
//             type : 'singular',
//             namespace :  namespace,
//             metricType : 'Singular',
//             metricName : metricString.label,
//             konomMetric : metricString.id
//         };
//
//         constraints  = getConstraints(samuraiData, metricString.id);
//         configuration.splits = constraints.splits;
//         configuration.filters = constraints.filters;
//         configuration.showMetricData.collapsedFilters = constraints.collapsedFilters
//     }
//
//     return configuration;
// };

var prepareConfigurationForSamurai = function(samuraiData, namespace){

    var metricString = samuraiData.values[0];

    // var configuration = new Map();
    // var metric = new Map();
    //
    // configuration.set('name', metricString.label);
    // configuration.set('namespace', namespace);
    // configuration.set('datasource', 'Samurai');
    // configuration.set('threshold', 50);
    // configuration.set('trend', generateRandom(["drop", "rise"]));
    // configuration.set('track', generateRandom(["gradual", "sudden"]));
    //
    // metric.set('name', null);
    // metric.set('formula', null);
    // configuration.set('metric', metric);
    // configuration.set('filters', []);
    // configuration.set('splits', []);

    var configuration = {
        name : metricString.label,
        namespace : namespace,
        datasource : 'Samurai',
        threshold : 50,
        trend : generateRandom(["drop", "rise"]),
        track : generateRandom(["gradual", "sudden"]),
        metric : {
            name : null,
            formula : null
        },
        filters : [],
        splits : []
    };


    var constraints = null;
    var hasCustomMeasure = typeof samuraiData.customMeasures !== 'undefined' && samuraiData.customMeasures.length;

    if(typeof metricString.tables !== 'undefined' || hasCustomMeasure){
        if(hasCustomMeasure || (typeof metricString.formula === 'undefined' && metricString.tables.length)){

            var metricFormula = metricString.id;

            if(hasCustomMeasure){
                metricFormula = samuraiData.customMeasures[0].parsedFormula;
            }

            // var formattedMetrics = formatFromCurlyBraces(metricFormula);
            constraints  = getConstraints(samuraiData, metricString.id);


            configuration.metric.name = metricString.label;
            configuration.metric.formula = metricFormula;
            configuration.splits = constraints.splits;
            configuration.filters = constraints.filters;

            // = {
            //     type : 'correlation',
            //     namespace :  namespace,
            //     metricType : 'Correlation',
            //     metricName : metricString.label,
            //     numeratorKonomMetric : formattedMetrics[0],
            //     denominatorKonomMetric : formattedMetrics[1]
            // };
            //
            // configuration.showMetricData.collapsedFilters = constraints.collapsedFilters;
            // configuration.showMetricData.formula = formatFormula(metricFormula);
        }
        else {
            alert('This measure is not supported for creating the configuration till now');
            return false;
        }
    }
    else {
        // singular

        constraints  = getConstraints(samuraiData, metricString.id);
        configuration.metric.name = metricString.label;
        configuration.metric.formula = metricString.id;
        configuration.splits = constraints.splits;
        configuration.filters = constraints.filters;

        // configuration.metric = {
        //     type : 'singular',
        //     namespace :  namespace,
        //     metricType : 'Singular',
        //     metricName : metricString.label,
        //     konomMetric : metricString.id
        // };
        //
        //
        // configuration.splits = constraints.splits;
        // configuration.filters = constraints.filters;
        // configuration.showMetricData.collapsedFilters = constraints.collapsedFilters
    }

    // metric.set('name', metricString.label);
    // metric.set('formula', metricString.id);
    // metric.set('splits', constraints.splits);
    // metric.set('filters', constraints.splits);

    return configuration;
};

var generateRandom = function(values){
    return values[Math.floor(Math.random() * (values.length))];
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

            if(samuraiFilter.id === 'Time') continue;

            constraints.collapsedFilters.push({
                label : samuraiFilter.id,
                values : samuraiFilter.data.values,
                isPivot : splitNames.indexOf(samuraiFilter.id) !== -1
            });

            constraints.filters.push({
                type : samuraiFilter.data.filterType,
                name : samuraiFilter.id,
                values : samuraiFilter.data.data
            });

            // for(var value in samuraiFilter.data.values){
            //     if(!samuraiFilter.data.values.hasOwnProperty(value)) continue;
            //     var filterValue = samuraiFilter.data.values[value];
            //
            //     constraints.filters.push({
            //         type : samuraiFilter.data.filterType,
            //         name : samuraiFilter.id,
            //         entityValue : filterValue
            //     });
            // }
        }
    }

    return constraints;
};