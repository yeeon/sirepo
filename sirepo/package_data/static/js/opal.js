'use strict';

var srlog = SIREPO.srlog;
var srdbg = SIREPO.srdbg;

SIREPO.app.config(function($routeProvider, localRoutesProvider) {
    if (SIREPO.IS_LOGGED_OUT) {
        return;
    }
    var localRoutes = localRoutesProvider.$get();
    $routeProvider
        .when(localRoutes.source, {
            controller: 'OpalSourceController as source',
            templateUrl: '/static/html/opal-source.html' + SIREPO.SOURCE_CACHE_KEY,
        });
});

SIREPO.app.controller('OpalSourceController', function (appState, panelState, $scope) {
    var self = this;

    function updateDistributionFields() {
        var dist = appState.models.distribution;
        panelState.showField('distribution', 'fromFile', dist.type == 'FROMFILE');
        panelState.showTab('distribution', 2, dist.type == 'GAUSS');
        Object.keys(dist).forEach(function(f) {
            if (f.indexOf('gaussian') >= 0) {
                panelState.showField('distribution', f, dist.type == 'GAUSS');
            }
            else if (f.indexOf('flattop') >= 0) {
                panelState.showField('distribution', f, dist.type == 'FLATTOP');
            }
            else if (f.indexOf('binomial') >= 0) {
                panelState.showField('distribution', f, dist.type == 'BINOMIAL');
            }
        });
    }

    function updateParticleFields() {
        ['mass', 'charge'].forEach(function(f) {
            panelState.showField('beam', f, appState.models.beam.particle == 'other');
        });
    }

    self.handleModalShown = function(name) {
        if (name == 'distribution') {
            updateDistributionFields();
        }
    };

    appState.whenModelsLoaded($scope, function() {
        appState.watchModelFields($scope, ['beam.particle'], updateParticleFields);
        appState.watchModelFields($scope, ['distribution.type'], updateDistributionFields);
        updateParticleFields();
        updateDistributionFields();
    });

});

SIREPO.app.directive('appHeader', function(appState, panelState) {
    return {
        restrict: 'A',
        scope: {
            nav: '=appHeader',
        },
        template: [
            '<div data-app-header-brand="nav"></div>',
            '<div data-app-header-left="nav"></div>',
            '<div data-app-header-right="nav">',
              '<app-header-right-sim-loaded>',
                '<ul class="nav navbar-nav sr-navbar-right">',
                '<li data-ng-class="{active: nav.isActive(\'source\')}"><a href data-ng-click="nav.openSection(\'source\')"><span class="glyphicon glyphicon-flash"></span> Source</a></li>',
              '</app-header-right-sim-loaded>',
              '<app-settings>',
              //  '<div>App-specific setting item</div>',
              '</app-settings>',
              '<app-header-right-sim-list>',
                //'<ul class="nav navbar-nav navbar-right">',
                //  '<li>App-specific items</li>',
                //'</ul>',
              '</app-header-right-sim-list>',
            '</div>',
        ].join(''),
        controller: function($scope) {
        },
    };
});
