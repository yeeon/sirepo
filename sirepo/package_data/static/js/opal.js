'use strict';

var srlog = SIREPO.srlog;
var srdbg = SIREPO.srdbg;

SIREPO.appLocalRoutes.lattice = '/lattice/:simulationId';
SIREPO.appLocalRoutes.control = '/control/:simulationId';
SIREPO.appLocalRoutes.visualization = '/visualization/:simulationId';
SIREPO.app.config(function($routeProvider, localRoutesProvider) {
    if (SIREPO.IS_LOGGED_OUT) {
        return;
    }
    var localRoutes = localRoutesProvider.$get();
    $routeProvider
        .when(localRoutes.source, {
            controller: 'OpalSourceController as source',
            templateUrl: '/static/html/opal-source.html' + SIREPO.SOURCE_CACHE_KEY,
        })
        .when(localRoutes.lattice, {
            controller: 'LatticeController as lattice',
            templateUrl: '/static/html/opal-lattice.html' + SIREPO.SOURCE_CACHE_KEY,
        })
        .when(localRoutes.control, {
            controller: 'CommandController as control',
            templateUrl: '/static/html/opal-control.html' + SIREPO.SOURCE_CACHE_KEY,
        })
        .when(localRoutes.visualization, {
            controller: 'VisualizationController as visualization',
            templateUrl: '/static/html/opal-visualization.html' + SIREPO.SOURCE_CACHE_KEY,
        });
});

SIREPO.app.controller('CommandController', function() {
    var self = this;
});

SIREPO.app.controller('LatticeController', function($window) {
    var self = this;

    self.splitPaneHeight = function() {
        var w = $($window);
        var el = $('.sr-split-pane-frame');
        return Math.round(w.height() - el.offset().top - 15) + 'px';
    };
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

SIREPO.app.controller('VisualizationController', function(appState, frameCache, panelState, persistentSimulation, $scope) {
    var self = this;
    self.panelState = panelState;
    self.model = 'animation';
    self.handleStatus = function(data) {
        self.simulationErrors = data.errors || '';
        frameCache.setFrameCount(data.frameCount);
        if (data.startTime && data.frameCount && ! data.error) {
            ['bunchAnimation', 'plot1Animation', 'plot2Animation'].forEach(function(f) {
                appState.models[f].startTime = data.startTime;
                appState.saveQuietly(f);
            });
            ['plot1Animation', 'plot2Animation'].forEach(function(f) {
                frameCache.setFrameCount(1, f);
            });

        }
    };
    persistentSimulation.initProperties(self, $scope, {
        bunchAnimation: [SIREPO.ANIMATION_ARGS_VERSION + '1', 'x', 'y', 'histogramBins', 'startTime'],
        plot1Animation: [SIREPO.ANIMATION_ARGS_VERSION + '1', 'x_field', 'y1_field', 'y2_field', 'startTime'],
        plot2Animation: [SIREPO.ANIMATION_ARGS_VERSION + '1', 'x_field', 'y1_field', 'y2_field', 'startTime'],
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
                  '<li data-ng-class="{active: nav.isActive(\'lattice\')}"><a data-ng-href="{{ nav.sectionURL(\'lattice\') }}"><span class="glyphicon glyphicon-option-horizontal"></span> Lattice</a></li>',
                  '<li data-ng-class="{active: nav.isActive(\'control\')}"><a data-ng-href="{{ nav.sectionURL(\'control\') }}"><span class="glyphicon glyphicon-option-horizontal"></span> Control</a></li>',
                  '<li data-ng-class="{active: nav.isActive(\'visualization\')}"><a data-ng-href="{{ nav.sectionURL(\'visualization\') }}"><span class="glyphicon glyphicon-picture"></span> Visualization</a></li>',
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

SIREPO.app.directive('beamlineEditor', function($window) {
    return {
        restrict: 'A',
        scope: {
            lattice: '=controller',
        },
        template: [
            '<div class="panel panel-info" style="margin-bottom: 0">',
              '<div class="panel-heading"><span class="sr-panel-heading">Beamline Editor - L2_to_L4</span>',
                '<div class="sr-panel-options pull-right">',
                  '<a href title="Edit"><span class="sr-panel-heading glyphicon glyphicon-pencil"></span></a> ',
                '</div>',
              '</div>',
              '<div style="height: {{ editorHeight() }}" class="panel-body elegant-beamline-editor-panel">',
                '<p class="lead text-center"><small><em>drag and drop elements here to define the beamline</em></small></p>',
                '<div data-ng-repeat="item in beamlineItems" class="elegant-beamline-element" data-ng-class="{\'elegant-beamline-element-group\': item.inRepeat }">',
                  '<div class="sr-drop-left">&nbsp;</div>',
                  '<div style="display: inline-block; cursor: move; -moz-user-select: none" class="badge elegant-icon elegant-beamline-element-with-count"><span>{{ item.name }}</span></div>',
                '</div>',
              '</div>',
            '</div>',
        ].join(''),
        controller: function($scope) {
            //TODO(pjm): mock data
            $scope.beamlineItems = [
                {
                    itemId: 1,
                    name: 'L3_BM1',
                },
                {
                    itemId: 2,
                    name: 'L3_QM1',
                },
                {
                    itemId: 3,
                    name: 'L3_BM2',
                },
                {
                    itemId: 4,
                    name: 'L3_BM3',
                },
                {
                    itemId: 5,
                    name: 'L3_QM2',
                },
                {
                    itemId: 6,
                    name: 'L3_BM4',
                },
            ];
            $scope.editorHeight = function() {
                var w = $($window);
                var el = $('.elegant-beamline-editor-panel');
                return (w.height() - el.offset().top - 15) + 'px';
            };
        },
    };
});

SIREPO.app.directive('beamlineTable', function(appState, $window) {
    return {
        restrict: 'A',
        scope: {
            lattice: '=controller',
        },
        template: [
            '<table style="width: 100%; table-layout: fixed" class="table table-hover">',
              '<colgroup>',
                '<col style="width: 20ex">',
                '<col>',
                '<col style="width: 12ex">',
                '<col style="width: 10ex">',
              '</colgroup>',
              '<thead>',
                '<tr>',
                  '<th>Name</th>',
                  '<th>Description</th>',
                  '<th>Length</th>',
                  '<th>Bend</th>',
                '</tr>',
              '</thead>',
              '<tbody>',
                '<tr data-ng-class="{success: isActiveBeamline(beamline)}" data-ng-repeat="beamline in beamlines track by beamline.id">',
                  '<td><div class="badge elegant-icon elegant-beamline-icon"><span data-ng-drag="true" data-ng-drag-data="beamline">{{ beamline.name }}</span></div></td>',
                  '<td style="overflow: hidden"><span style="color: #777; white-space: nowrap">{{ beamline.description }}</span></td>',
                  '<td style="text-align: right">{{ beamline.length }}</td>',
                  '<td style="text-align: right">{{ beamline.bend }}<span>&deg;</span></td>',
                '</tr>',
              '</tbody>',
            '</table>',
        ].join(''),
        controller: function($scope) {
            //TODO(pjm): mock data
            $scope.beamlines = [
                {
                    id: 1,
                    name: 'L2_to_L4',
                    length: '3.375m',
                    bend: '0.0',
                    count: 6,
                    description: '(' + [
                        'L3_BM1', 'L3_QM1', 'L3_BM2', 'L3_BM3', 'L3_QM2', 'L3_BM4',
                    ].join(',') + ')',
                },
            ];

            var windowSize = 0;

            $scope.isActiveBeamline = function(beamline) {
                return true;
            };

            function windowResize() {
                windowSize = $($window).width();
                $scope.$applyAsync();
            }

            $($window).resize(windowResize);
            windowResize();
            $scope.$on('$destroy', function() {
                $($window).off('resize', windowResize);
            });
        },
    };
});

SIREPO.app.directive('commandTable', function() {
    return {
        restrict: 'A',
        scope: {},
        template: [
            '<div class="elegant-cmd-table">',
              '<div class="pull-right">',
                '<button class="btn btn-info btn-xs" accesskey="c"><span class="glyphicon glyphicon-plus"></span> New <u>C</u>ommand</button>',
              '</div>',
              '<p class="lead text-center"><small><em>drag and drop commands to reorder the list</em></small></p>',
              '<table class="table table-hover" style="width: 100%; table-layout: fixed">',
                '<tr data-ng-repeat="cmd in commands">',
                  '<td>',
                    '<div class="sr-button-bar-parent pull-right"><div class="sr-button-bar"><button class="btn btn-info btn-xs sr-hover-button" data-ng-click="editCommand(cmd)">Edit</button> <button data-ng-click="expandCommand(cmd)" data-ng-disabled="isExpandDisabled(cmd)" class="btn btn-info btn-xs"><span class="glyphicon" data-ng-class="{\'glyphicon-triangle-top\': isExpanded(cmd), \'glyphicon-triangle-bottom\': ! isExpanded(cmd)}"></span></button> <button data-ng-click="deleteCommand(cmd)" class="btn btn-danger btn-xs"><span class="glyphicon glyphicon-remove"></span></button></div></div>',
                    '<div class="elegant-cmd-icon-holder" data-ng-drag="true" data-ng-drag-data="cmd">',
                      '<a style="cursor: move; -moz-user-select: none; font-size: 14px" class="badge elegant-icon" data-ng-class="{\'elegant-item-selected\': isSelected(cmd) }" href data-ng-click="selectItem(cmd)" data-ng-dblclick="editCommand(cmd)">{{ cmd._type }}</a>',
                    '</div>',
                    '<div data-ng-show="cmd.description" style="color: #777; margin-left: 3em; white-space: pre-wrap">{{ cmd.description }}</div>',
                  '</td>',
                '</tr>',
                '<tr><td style="height: 3em" data-ng-drop="true" data-ng-drop-success="dropLast($data)"> </td></tr>',
              '</table>',
              '<div data-ng-show="commands.length > 2" class="pull-right">',
                '<button class="btn btn-info btn-xs" accesskey="c"><span class="glyphicon glyphicon-plus"></span> New <u>C</u>ommand</button>',
              '</div>',
            '</div>',
        ].join(''),
        controller: function($scope) {
            $scope.commands = [
                {
                    _type: 'OPTION',
                    description: "PSDUMPFREQ = 300;\nSTATDUMPFREQ = 10;\nBOUNDPDESTROYFQ=10\nAUTOPHASE=4;",
                },
                {
                    _type: 'Beam1: BEAM',
                    description: "PARTICLE = ELECTRON,\npc = P0,\nNPART = 5000,\nBFREQ = 1300000000.0,\nBCURRENT = 0.013,\nMASS = 1.0,\nCHARGE = 1.0;",
                },
                {
                    _type: 'Fs1: FIELDSOLVER',
                    description: "FSTYPE = NONE,\nMX = 32,\nMY = 32,\nMT = 32,\nPARFFTX = false,\nPARFFTY = false,\nPARFFTT = true,\nBCFFTX = open,\nBCFFTY = open,\nBCFFTT = open,\nBBOXINCR = 1,\nGREENSF = INTEGRATED;",
                },
                {
                    _type: 'Dist1: DISTRIBUTION',
                    description: "DISTRIBUTION = BINOMIAL,\nMX = 0.5,\nSIGMAX = 1.0,\nSIGMAY = 1.0,\nSIGMAZ = 1.0,\nSIGMAPX = 1.0,\nSIGMAPY = 0.001,\nSIGMAPZ = 0.001;",
                },
                {
                    _type: 'TRACK',
                    description: "LINE = Lattice,\nBEAM = Beam1,\nMAXSTEPS = 1000,\nDT = {5.0e-12};\nRUN,\n  METHOD = \"PARALLEL-T\",\n  BEAM = Beam1,\n  FIELDSOLVER = Fs1,\n  DISTRIBUTION = Dist1;",
                },
            ];
        },
    };
});

SIREPO.app.directive('elementTable', function(appState) {
    return {
        restrict: 'A',
        scope: {
            lattice: '=controller',
        },
        template: [
            '<table style="width: 100%; table-layout: fixed" class="table table-hover">',
              '<colgroup>',
                '<col style="width: 20ex">',
                '<col>',
                '<col style="width: 12ex">',
                '<col style="width: 10ex">',
              '</colgroup>',
              '<thead>',
                '<tr>',
                  '<th>Name</th>',
                  '<th>Description</th>',
                  '<th>Length</th>',
                  '<th>Bend</th>',
                '</tr>',
              '</thead>',
              '<tbody data-ng-repeat="category in tree track by category.name">',
                '<tr>',
                  '<td style="cursor: pointer" colspan="4"><span class="glyphicon glyphicon-collapse-down"></span> <b>{{ category.name }}</b></td>',
                '</tr>',
                '<tr data-ng-repeat="element in category.elements track by element._id">',
                  '<td style="padding-left: 1em"><div class="badge elegant-icon"><span data-ng-drag="true" data-ng-drag-data="element">{{ element.name }}</span></div></td>',
                  '<td style="overflow: hidden"><span style="color: #777; white-space: nowrap">{{ element.description }}</span></td>',
                  '<td style="text-align: right">{{ element.length }}</td>',
                  '<td style="text-align: right">{{ element.bend }}<span data-ng-if="element.bend">&deg;</span></td>',
                '</tr>',
              '</tbody>',
            '</table>',
        ].join(''),
        controller: function($scope) {
            //TODO(pjm): mock data
            $scope.tree = [
                {
                    name: 'QUADRUPOLE',
                    elements: [
                        {
                            '_id': 1,
                            name: 'L3_QM1',
                            description: 'k1=-0.273',
                            length: '77.60mm',
                        },
                        {
                            '_id': 2,
                            name: 'L3_QM2',
                            description: 'k1=0.47245527',
                            length: '77.60mm',
                        },
                    ],
                },
                {
                    name: 'SBEND',
                    elements: [
                        {
                            '_id': 3,
                            name: 'L3_BM1',
                            description: 'e2=0.234799886',
                            length: '193.3mm',
                            bend: '13.5',
                        },
                        {
                            '_id': 4,
                            name: 'L3_BM2',
                            description: 'e1=-0.234799886',
                            length: '193.3mm',
                            bend: '-13.5',
                        },
                        {
                            '_id': 5,
                            name: 'L3_BM3',
                            description: 'e2=-0.133242',
                            length: '192.4mm',
                            bend: '-7.6',
                        },
                        {
                            '_id': 6,
                            name: 'L3_BM4',
                            description: 'e1=0.133242',
                            length: '192.4mm',
                            bend: '7.6',
                        },
                    ],
                },
            ];
            var collapsedElements = {};

            $scope.isExpanded = function(category) {
                return ! collapsedElements[category.name];
            };

            $scope.toggleCategory = function(category) {
                collapsedElements[category.name] = ! collapsedElements[category.name];
            };
        },
    };
});
