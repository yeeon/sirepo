'use strict';

var srlog = SIREPO.srlog;
var srdbg = SIREPO.srdbg;

SIREPO.PLOTTING_COLOR_MAP = 'grayscale';
SIREPO.app.config(function($routeProvider, localRoutesProvider) {
    if (SIREPO.IS_LOGGED_OUT) {
        return;
    }
    var localRoutes = localRoutesProvider.$get();
    $routeProvider
        .when(localRoutes.source, {
            controller: 'RobotSourceController as source',
            templateUrl: '/static/html/robot-source.html' + SIREPO.SOURCE_CACHE_KEY,
        });
});

SIREPO.app.factory('robotService', function(appState, frameCache, requestSender, $rootScope) {
    var self = {};
    var PLANE_COORD_NAME = {
        t: 'z',
        s: 'x',
        c: 'y',
    };
    var dicomHistogram = {};
    var roiPoints = {};
    var planeCoord = {};
    // zoom or advanceFrame
    self.zoomMode = 'advanceFrame';
    self.isEditMode = false;
    // select, draw, or reshape
    self.editMode = 'select';

    self.dicomTitle = function(modelName) {
        if (! appState.isLoaded()) {
            return;
        }
        var series = appState.models.dicomSeries;
        var enumText = '';
        var plane = appState.models[modelName].dicomPlane;
        SIREPO.APP_SCHEMA.enum.DicomPlane.forEach(function(enumInfo) {
            if (enumInfo[0] == plane) {
                enumText = enumInfo[1];
            }
        });
        var planeCoord = self.getPlaneCoord(plane);
        return enumText + ' (' + (frameCache.getCurrentFrame(modelName) + 1)
            + ' / ' + series.planes[plane].frameCount + ') '
            + (planeCoord ? (
                PLANE_COORD_NAME[plane] + ': ' + planeCoord.toFixed(1) + 'mm'
            ) : '');
    };


    self.getDicomHistogram = function() {
        return dicomHistogram;
    };

    self.getPlaneCoord = function(plane) {
        return planeCoord[plane];
    };

    self.getROIPoints = function() {
        return roiPoints;
    };

    self.loadROIPoints = function() {
        appState.whenModelsLoaded($rootScope, function() {
            requestSender.getApplicationData(
                {
                    method: 'roi_points',
                    simulationId: appState.models.simulation.simulationId,
                },
                function(data) {
                    dicomHistogram = data.models.dicomHistogram;
                    roiPoints = data.models.regionsOfInterest;
                    $rootScope.$broadcast('roiPointsLoaded');
                });
        });
    };

    self.setEditMode = function(mode) {
        self.editMode = mode;
    };

    self.setPlaneCoord = function(plane, v) {
        if (planeCoord[plane] != v) {
            planeCoord[plane] = v;
            $rootScope.$broadcast('planeCoordChanged');
        }
    };

    self.toggleEditMode = function() {
        self.isEditMode = ! self.isEditMode;
    };

    return self;
});

SIREPO.app.controller('RobotSourceController', function (appState, frameCache, persistentSimulation, robotService, $scope) {
    var self = this;
    self.model = 'animation';

    self.dicomTitle = function() {
        if (! appState.isLoaded()) {
            return;
        }
        return appState.models.dicomSeries.description;
    };

    self.handleStatus = function(data) {
        if (data.state == 'stopped' && data.percentComplete === 0) {
            self.runSimulation();
            return;
        }
        if (data.startTime) {
            appState.models.dicomAnimation.startTime = data.startTime;
            appState.saveQuietly('dicomAnimation');
        }
        self.simulationErrors = data.errors || '';
        frameCache.setFrameCount(data.frameCount);
    };

    persistentSimulation.initProperties(self, $scope, {
        dicomAnimation: ['dicomPlane', 'startTime'],
        dicomAnimation2: ['dicomPlane', 'startTime'],
        dicomAnimation3: ['dicomPlane', 'startTime'],
    });

    robotService.loadROIPoints();
});

SIREPO.app.directive('appHeader', function(appState, panelState) {
    return {
        restrict: 'A',
        scope: {
            nav: '=appHeader',
        },
        template: [
            '<div class="navbar-header">',
              '<a class="navbar-brand" href="/#about"><img style="width: 40px; margin-top: -10px;" src="/static/img/radtrack.gif" alt="radiasoft"></a>',
              '<div class="navbar-brand"><a href data-ng-click="nav.openSection(\'simulations\')">RS4PI</a></div>',
            '</div>',
            '<div data-app-header-left="nav"></div>',
            '<ul class="nav navbar-nav navbar-right" data-login-menu=""></ul>',
            '<ul class="nav navbar-nav navbar-right" data-ng-show="isLoaded()">',
              '<li data-ng-class="{active: nav.isActive(\'source\')}"><a href data-ng-click="nav.openSection(\'source\')"><span class="glyphicon glyphicon-flash"></span> Source</a></li>',
            '</ul>',
            '<ul class="nav navbar-nav navbar-right" data-ng-show="nav.isActive(\'simulations\')">',
              '<li><a href data-ng-click="importDicomModal()"><span class="glyphicon glyphicon-plus sr-small-icon"></span><span class="glyphicon glyphicon-file"></span> Import DICOM</a></li>',
              '<li><a href data-ng-click="showNewFolderModal()"><span class="glyphicon glyphicon-plus sr-small-icon"></span><span class="glyphicon glyphicon-folder-close"></span> New Folder</a></li>',
            '</ul>',
        ].join(''),
        controller: function($scope) {
            $scope.isLoaded = function() {
                if ($scope.nav.isActive('simulations')) {
                    return false;
                }
                return appState.isLoaded();
            };
            $scope.showNewFolderModal = function() {
                panelState.showModalEditor('simulationFolder');
            };
            $scope.importDicomModal = function() {
                $('#dicom-import').modal('show');
            };
        },
    };
});

SIREPO.app.directive('appFooter', function() {
    return {
        restrict: 'A',
        scope: {
            nav: '=appFooter',
        },
        template: [
            '<div data-dicom-import-dialog=""></div>',
        ].join(''),
    };
});

SIREPO.app.directive('dicomImportDialog', function(appState, fileUpload, requestSender) {
    return {
        restrict: 'A',
        scope: {},
        template: [
            '<div class="modal fade" data-backdrop="static" id="dicom-import" tabindex="-1" role="dialog">',
              '<div class="modal-dialog modal-lg">',
                '<div class="modal-content">',
                  '<div class="modal-header bg-info">',
                    '<button type="button" class="close" data-dismiss="modal"><span>&times;</span></button>',
                    '<div data-help-button="{{ title }}"></div>',
                    '<span class="lead modal-title text-info">{{ title }}</span>',
                  '</div>',
                  '<div class="modal-body">',
                    '<div class="container-fluid">',
                        '<form class="form-horizontal" name="importForm">',
                          '<div data-ng-show="filename" class="form-group">',
                            '<label class="col-xs-4 control-label">Importing file</label>',
                            '<div class="col-xs-8">',
                              '<p class="form-control-static">{{ filename }}</p>',
                            '</div>',
                          '</div>',
                          '<div data-ng-show="isState(\'ready\')">',
                            '<div data-ng-show="isState(\'ready\')" class="form-group">',
                              '<label>Select DICOM Series (.zip) File</label>',
                              '<input id="dicom-file-import" type="file" data-file-model="dicomFile" accept=".zip" />',
                              '<br />',
                              '<div class="text-warning"><strong>{{ fileUploadError }}</strong></div>',
                            '</div>',
                            '<div class="col-sm-6 pull-right">',
                              '<button data-ng-click="importDicomFile(dicomFile)" class="btn btn-primary" data-ng-class="{\'disabled\': ! dicomFile }">Import File</button>',
                              ' <button data-dismiss="modal" class="btn btn-default">Cancel</button>',
                            '</div>',
                          '</div>',
                          '<div data-ng-show="isState(\'import\')" class="col-sm-12">',
                            '<div class="text-center">',
                              '<span class="glyphicon glyphicon-hourglass"> </span> ',
                              'Importing file - please wait. This may take several minutes.',
                              '<br /><br />',
                            '</div>',
                          '</div>',
                        '</form>',
                      '</div>',
                    '</div>',
                  '</div>',
                '</div>',
              '</div>',
            '</div>',
        ].join(''),
        controller: function($scope) {
            $scope.title = 'Import DICOM File';
            $scope.state = 'ready';

            function hideAndRedirect(id) {
                $('#dicom-import').modal('hide');
                requestSender.localRedirect('source', {
                    ':simulationId': id,
                });
            }

            $scope.importDicomFile = function(dicomFile) {
                if (! dicomFile) {
                    return;
                }
                $scope.state = 'import';
                fileUpload.uploadFileToUrl(
                    dicomFile,
                    {
                        folder: appState.getActiveFolderPath(),
                    },
                    requestSender.formatUrl(
                        'importFile',
                        {
                            '<simulation_type>': SIREPO.APP_SCHEMA.simulationType,
                        }),
                    function(data) {
                        if (data.error || ! data.models) {
                            $scope.resetState();
                            $scope.fileUploadError = data.error || 'A server error occurred.';
                        }
                        else {
                            hideAndRedirect(data.models.simulation.simulationId);
                        }
                    });
            };

            $scope.isState = function(state) {
                return $scope.state == state;
            };

            $scope.resetState = function() {
                $scope.dicomFile = null;
                $scope.fileUploadError = '';
                $scope.state = 'ready';
            };
        },
        link: function(scope, element) {
            $(element).on('show.bs.modal', function() {
                $('#dicom-file-import').val(null);
                scope.$applyAsync(scope.resetState);
            });
            scope.$on('$destroy', function() {
                $(element).off();
            });
        },
    };
});

SIREPO.app.directive('dicomHistogram', function(appState, plotting, robotService) {
    return {
        restrict: 'A',
        scope: {
            modelName: '@',
        },
        template: [
            '<svg class="sr-plot sr-histogram" width="100%" ng-attr-height="{{ height + margin.top + margin.bottom }}">',
              '<g class="plot-g" ng-attr-transform="translate({{ margin.left }},{{ margin.top }})">',
                '<g class="x axis" ng-attr-transform="translate(0, {{ height }})">',
                  '<text class="x-axis-label" ng-attr-x="{{ width / 2 }}" y="40">Hounsfield Units (HU)</text>',
                '</g>',
              '</g>',
            '</svg>',
        ].join(''),
        controller: function($scope) {
            var MIN_HEIGHT = 40;
            $scope.margin = {top: 20, right: 20, bottom: 45, left: 20};
            $scope.width = 0;
            $scope.height = 0;
            var arc, bins, brush, brushg, histogram, plotg, svg, xAxis, xScale, yScale;
            $scope.isClientOnly = true;

            function brushend() {
                if (brush.empty()) {
                    setBounds(null);
                    return;
                }
                var b = brush.extent();
                var left = b[0],
                    right = b[1];
                bins.map(function(d) {
                    left = trimBound(d, left);
                    right = trimBound(d, right);
                });
                setBounds([left, right]);
            }

            function redrawSelectedArea() {
                if (brush.empty()) {
                    svg.selectAll(".bar rect").style("opacity", "1");
                    return;
                }
                var b = brush.extent();
                svg.selectAll(".bar rect").style("opacity", function(d, i) {
                    return d.x + d.dx/2.0 > b[0] && d.x + d.dx/2.0 < b[1] ? "1" : ".4";
                });
            }

            function setBounds(bounds) {
                if (bounds && bounds[0] != bounds[1]) {
                    //TODO(pjm): validate bounds within domain?
                    brushg.call(brush.extent(bounds));
                }
                else {
                    brush.clear();
                    bounds = xScale.domain();
                }
                var dicomWindow = appState.models.dicomWindow;
                dicomWindow.width = bounds[1] - bounds[0];
                dicomWindow.center = bounds[0] + dicomWindow.width / 2;
                $scope.$applyAsync(function() {
                    appState.saveChanges('dicomWindow');
                });
            }

            function trimBound(d, bound) {
                if (d.x + d.dx > bound && d.x < bound) {
                    if (d.x + d.dx/2.0 > bound) {
                        return d.x;
                    }
                    return d.x + d.dx;
                }
                return bound;
            }

            $scope.destroy = function() {
            };

            $scope.init = function() {
                svg = d3.select($scope.element).select('.sr-histogram');
                plotg = svg.select('.plot-g');
                histogram = d3.layout.histogram();
                xScale = d3.scale.linear();
                yScale = d3.scale.linear();
                brush = d3.svg.brush()
                    .on("brush", redrawSelectedArea)
                    .on("brushend", brushend);
                arc = d3.svg.arc()
                    .startAngle(0)
                    .endAngle(function(d, i) { return i ? -Math.PI : Math.PI; });
                xAxis = plotting.createAxis(xScale, 'bottom');
            };

            $scope.load = function() {
                if (! svg) {
                    return;
                }
                var dicomHistogram = robotService.getDicomHistogram();
                var idx = 0;
                var extent = dicomHistogram.extent;
                if (! extent) {
                    // dicomHistogram not loaded yet
                    return;
                }
                var dx = (extent[1] - extent[0]) / (extent[2] - 1);
                xScale.domain([extent[0], extent[1]]);
                bins = plotting.linspace(extent[0], extent[1], extent[2]).map(function(d) {
                    return {
                        x: d,
                        dx: dx,
                        y: dicomHistogram.histogram[idx++],
                    };
                });
                yScale.domain([0, d3.max(bins, function(d){return d.y;})]).nice();
                plotg.selectAll(".bar").remove();
                var bar = plotg.selectAll(".bar")
                    .data(bins)
                    .enter().append("g")
                    .attr("class", "bar");
                bar.append("rect")
                    .attr("x", 1);
                plotg.selectAll('.brush').remove();
                brushg = plotg.append("g")
                    .attr("class", "brush")
                    .call(brush);
                brushg.selectAll(".resize").append("path");
                $scope.resize();
            };

            $scope.resize = function() {
                if (plotg.select('.bar').empty()) {
                    return;
                }
                $scope.width = parseInt(svg.style('width')) - $scope.margin.left - $scope.margin.right;
                $scope.height = Math.floor($scope.width / 1.5) - $scope.margin.top - $scope.margin.bottom;
                if ($scope.height < MIN_HEIGHT) {
                    $scope.height = MIN_HEIGHT;
                }
                xScale.range([0, $scope.width]);
                yScale.range([$scope.height, 0]);
                plotting.ticks(xAxis, $scope.width, true);
                plotg.selectAll(".bar")
                    .attr("transform", function(d) { return "translate(" + xScale(d.x) + "," + yScale(d.y) + ")"; });
                plotg.selectAll(".bar rect")
                    .attr("width", (xScale(bins[0].dx) - xScale(0)) - 1)
                    .attr("height", function(d) { return $scope.height - yScale(d.y); });
                plotg.select(".x.axis")
                    .call(xAxis);
                arc.outerRadius($scope.height / 15);
                brush.x(xScale);
                brushg.call(brush);
                brushg.selectAll(".resize path")
                    .attr("transform", "translate(0," +  $scope.height / 2 + ")")
                    .attr("d", arc);
                brushg.selectAll(".resize path")
                    .attr("transform", "translate(0," +  $scope.height / 2 + ")");
                brushg.selectAll("rect")
                    .attr("height", $scope.height);
                var dicomWindow = appState.models.dicomWindow;
                var b = [dicomWindow.center - dicomWindow.width / 2, dicomWindow.center + dicomWindow.width / 2];
                if (b[0] == xScale.domain()[0] && b[1] == xScale.domain()[1]) {
                    brush.clear();
                }
                else {
                    brushg.call(brush.extent(b));
                }
                redrawSelectedArea();
            };

            $scope.$on('roiPointsLoaded', function() {
                $scope.load();
            });

            $scope.$on('dicomWindow.changed', function() {
                $scope.resize();
            });

        },
        link: function link(scope, element) {
            plotting.linkPlot(scope, element);
        },
    };
});

SIREPO.app.directive('dicomPlot', function(appState, frameCache, panelState, plotting, robotService, $interval, $rootScope) {
    return {
        restrict: 'A',
        scope: {
            modelName: '@',
            isSubFrame: '@',
        },
        templateUrl: '/static/html/dicom.html' + SIREPO.SOURCE_CACHE_KEY,
        controller: function($scope) {
            $scope.robotService = robotService;
            $scope.margin = $scope.isSubFrame
                ? {top: 20, left: 10, right: 10, bottom: 0}
                : {top: 20, left: 60, right: 30, bottom: 30};
            // will be set to the correct size in resize()
            $scope.canvasSize = 0;
            $scope.canvasHeight = 0;

            var canvas, ctx, dicomDomain, frameId, xAxis, xAxisScale, xValues, yAxis, yAxisScale, yValues, zoom;
            var cacheCanvas, imageData;
            var selectedDicomPlane = '';
            var frameScale;
            $scope.requestCache = {};
            var inRequest = false;
            var oldDicomWindow = null;
            var colorScale;
            var heatmap;
            var roiLine;
            var roiContours = null;
            var drag;

            function redrawContours() {
                if (! roiContours) {
                    addContours();
                    return;
                }
                Object.keys(roiContours).forEach(function(roiNumber) {
                    var v = roiContours[roiNumber];
                    v.roiPath.attr('d', roiLine)
                        .classed('dicom-roi-selected', roiNumber == appState.models.dicomSeries.activeRoiNumber)
                        .attr('style', roiStyle(v.roi, roiNumber));
                    var canDrag = robotService.isEditMode && robotService.editMode == 'select';
                    v.dragPath.attr('d', roiLine)
                        .classed('dicom-dragpath-move', canDrag)
                        .classed('dicom-dragpath-select', ! canDrag);
                    if (canDrag) {
                        v.dragPath.call(drag);
                    }
                    else {
                        v.dragPath.on('.drag', null);
                    }
                });
            }

            function addContours() {
                clearContours();
                var yMax = yValues[yValues.length - 1];
                var xMin = dicomDomain[0][0];
                var yMin = dicomDomain[0][1];
                var rois = robotService.getROIPoints();
                if (! roiContours && Object.keys(rois).length == 0) {
                    return;
                }
                Object.keys(rois).forEach(function(roiNumber) {
                    rois[roiNumber].isVisible = false;
                });
                roiContours = {};
                Object.keys(rois).forEach(function(roiNumber) {
                    var roi = rois[roiNumber];
                    if (roi.contour && roi.contour[frameId]) {
                        roi.isVisible = true;
                        var points = [];
                        roi.contour[frameId].forEach(function(contourData) {
                            if (points.length) {
                                // roiLine.defined() controls breaks between path segments
                                points.push(null);
                            }
                            for (var i = 0; i < contourData.length; i += 2) {
                                points.push([
                                    (contourData[i] - xMin) / 1000,
                                    yMax - ((contourData[i + 1] - yMin) / 1000),
                                ]);
                            }

                        });
                        var parent = select('.polygons');
                        roiContours[roiNumber] = {
                            roi: roi,
                            roiNumber: roiNumber,
                            points: points,
                            roiPath: parent.append('path')
                                .attr('class', 'dicom-roi')
                                .datum(points),
                            dragPath: parent.append('path')
                                .attr('class', 'dicom-dragpath')
                                .datum(points)
                                .on('click', roiClick),
                        };
                        roiContours[roiNumber].dragPath.append('title').text(roi.name);
                    }
                });
                redrawContours();
            }

            function addPlaneLines() {
                if (! dicomDomain) {
                    return;
                }
                select().selectAll('.polygons line').remove();
                var yPlane = robotService.getPlaneCoord($scope.isTransversePlane() ? 'c' : 't');
                var y = (yPlane - dicomDomain[0][1]) / 1000;
                if ($scope.isTransversePlane()) {
                    y = yValues[yValues.length - 1] - y;
                }
                y = yAxisScale(y);
                if (isNaN(y)) {
                    return;
                }
                select('.polygons')
                    .append('line')
                    .attr('class', 'cross-hair')
                    .attr('x1', 0)
                    .attr('y1', y)
                    .attr('x2', $scope.canvasSize)
                    .attr('y2', y);

                var xPlane = robotService.getPlaneCoord(selectedDicomPlane == 's' ? 'c' : 's');
                var x = xAxisScale((xPlane - dicomDomain[0][0]) / 1000);
                if (isNaN(x)) {
                    return;
                }
                select('.polygons')
                    .append('line')
                    .attr('class', 'cross-hair')
                    .attr('x1', x)
                    .attr('y1', 0)
                    .attr('x2', x)
                    .attr('y2', $scope.canvasHeight);
            }

            function advanceFrame() {
                if (! d3.event || d3.event.sourceEvent.type == 'mousemove') {
                    return;
                }
                var scale = d3.event.scale;
                $scope.isPlaying = false;
                // don't advance for small scale adjustments, ex. from laptop touchpad
                if (Math.abs(scale - 1) < 0.03) {
                    return;
                }
                $scope.$applyAsync(function() {
                    if (scale > 1 && ! $scope.isLastFrame()) {
                        $scope.advanceFrame(1);
                    }
                    else if (scale < 1 && ! $scope.isFirstFrame()) {
                        $scope.advanceFrame(-1);
                    }
                    else {
                        resetZoom();
                    }
                });
            }

            function clearCache() {
                $scope.requestCache = {};
                colorScale = null;
            }

            function clearContours() {
                roiContours = null;
                select().selectAll('.polygons path').remove();
            }

            function dicomWindowChanged() {
                return !(oldDicomWindow && appState.deepEquals(oldDicomWindow, appState.models.dicomWindow));
            }

            function getRange(values) {
                return [values[0], values[values.length - 1]];
            }

            function getSize(values) {
                return values[values.length - 1] - values[0];
            }

            function initColormap() {
                if (! colorScale) {
                    var dicomWindow = appState.models.dicomWindow;
                    var zMin = dicomWindow.center - dicomWindow.width / 2;
                    var zMax = dicomWindow.center + dicomWindow.width / 2;
                    var colorRange = [0, 255];
                    colorScale = d3.scale.linear()
                        .domain(plotting.linspace(zMin, zMax, colorRange.length))
                        .rangeRound(colorRange)
                        .clamp(true);
                }
            }

            function initImage() {
                var xSize = heatmap[0].length;
                var ySize = heatmap.length;
                var img = imageData;

                for (var yi = 0, p = -1; yi < ySize; ++yi) {
                    for (var xi = 0; xi < xSize; ++xi) {
                        var c = colorScale(heatmap[yi][xi]);
                        img.data[++p] = c;
                        img.data[++p] = c;
                        img.data[++p] = c;
                        img.data[++p] = 0xff;
                    }
                }
                cacheCanvas.getContext('2d').putImageData(img, 0, 0);
            }

            function loadImage() {
                oldDicomWindow = appState.clone(appState.models.dicomWindow);
                initColormap();
                initImage();
            }

            function refresh() {
                if (robotService.zoomMode == 'zoom') {
                    plotting.trimDomain(xAxisScale, getRange(xValues));
                    plotting.trimDomain(yAxisScale, getRange(yValues));
                }
                select('.overlay').classed('mouse-zoom', robotService.zoomMode == 'zoom');
                plotting.drawImage(xAxisScale, yAxisScale, $scope.canvasSize, $scope.canvasHeight, xValues, yValues, canvas, cacheCanvas, false);
                if ($scope.isTransversePlane()) {
                    redrawContours();
                }
                addPlaneLines();
                resetZoom();
                select('.x.axis').call(xAxis);
                select('.y.axis').call(yAxis);
            }

            function resetZoom() {
                zoom = d3.behavior.zoom();
                select('.plot-viewport').call(zoom);
                if (robotService.zoomMode == 'zoom') {
                    zoom.x(xAxisScale)
                        .y(yAxisScale)
                        .on('zoom', refresh);
                }
                else if (robotService.zoomMode == 'advanceFrame') {
                    frameScale.domain([-1, 1]);
                    zoom.x(frameScale)
                        .on('zoom', advanceFrame);
                }
            }

            function redrawActivePath() {
                var active = roiContours[appState.models.dicomSeries.activeRoiNumber];
                active.roiPath.attr('d', roiLine);
                active.dragPath.attr('d', roiLine);
            }

            function roiDrag(d) {
                /*jshint validthis: true*/
                if (! robotService.isEditMode || robotService.editMode != 'select') {
                    console.log('roiDrag not select mode');
                    return;
                }
                var dx = d3.event.dx;
                var dy = d3.event.dy;
                if (dx || dy) {
                    var xDomain = xAxisScale.domain();
                    var xPixelSize = (xDomain[1] - xDomain[0]) / $scope.canvasSize;
                    var yDomain = yAxisScale.domain();
                    var yPixelSize = (yDomain[1] - yDomain[0]) / $scope.canvasHeight;
                    d.forEach(function(p) {
                        if (p) {
                            p[0] += dx * xPixelSize;
                            p[1] -= dy * yPixelSize;
                        }
                    });
                    setActiveROIFromNode(this);
                    redrawActivePath();
                }
            }

            function roiClick() {
                /*jshint validthis: true*/
                if (d3.event.defaultPrevented) {
                    return;
                }
                d3.event.preventDefault();
                setActiveROIFromNode(this);
            }

            function setActiveROIFromNode(node) {
                var roiNumbers = Object.keys(roiContours);
                for (var i = 0; i < roiNumbers.length; i++) {
                    if (roiContours[roiNumbers[i]].dragPath.node() === node) {
                        setActiveROI(roiNumbers[i]);
                        return;
                    }
                }
                throw 'invalid dragPath';
            }

            function setActiveROI(roiNumber) {
                if (roiNumber == appState.models.dicomSeries.activeRoiNumber) {
                    return;
                }
                $scope.$applyAsync(function() {
                    appState.models.dicomSeries.activeRoiNumber = roiNumber;
                    redrawContours();
                });
            }

            function roiStyle(roi, roiNumber) {
                var color = roi.color;
                var res = 'stroke: rgb(' + color.join(',') + ')';
                if (! robotService.isEditMode && appState.models.dicomSeries.activeRoiNumber == roiNumber) {
                    res += '; fill: rgb(' + color.join(',') + '); fill-opacity: 0.5';
                }
                return res;
            }

            function select(selector) {
                var e = d3.select($scope.element);
                return selector ? e.select(selector) : e;
            }

            function updateCurrentFrame() {
                appState.models.dicomSeries.planes[selectedDicomPlane].frameIndex = frameCache.getCurrentFrame($scope.modelName);
                appState.saveQuietly('dicomSeries');
            }

            function updateSelectedDicomPlane(plane) {
                selectedDicomPlane = plane;
                var planeInfo = appState.models.dicomSeries.planes[selectedDicomPlane];
                frameCache.setCurrentFrame($scope.modelName, planeInfo.frameIndex);
                frameCache.setFrameCount(planeInfo.frameCount, $scope.modelName);
            }

            $scope.destroy = function() {
                zoom.on('zoom', null);
            };

            $scope.dicomTitle = function() {
                return robotService.dicomTitle($scope.modelName);
            };

            $scope.getDefaultFrame = function() {
                var model = appState.models[$scope.modelName];
                return appState.models.dicomSeries.planes[model.dicomPlane].frameIndex || 0;
            };

            $scope.init = function() {
                select('svg').attr('height', plotting.initialHeight($scope));
                xAxisScale = d3.scale.linear();
                yAxisScale = d3.scale.linear();
                frameScale = d3.scale.linear();
                xAxis = plotting.createAxis(xAxisScale, 'bottom');
                xAxis.tickFormat(plotting.fixFormat($scope, 'x', 5));
                yAxis = plotting.createAxis(yAxisScale, 'left');
                yAxis.tickFormat(plotting.fixFormat($scope, 'y', 5));
                drag = d3.behavior.drag()
                    .origin(function(d) { return {x: d[0], y: d[1]}; })
                    .on('drag', roiDrag)
                    .on('dragstart', function() {
                        // don't let event propagate to zoom behavior
                        d3.event.sourceEvent.stopPropagation();
                    });
                resetZoom();
                canvas = select('canvas').node();
                ctx = canvas.getContext('2d');
                cacheCanvas = document.createElement('canvas');
                $scope.$on('planeCoordChanged', addPlaneLines);
                roiLine = d3.svg.line()
                    .defined(function(d) { return d !== null; })
                    .interpolate('linear-closed')
                    .x(function(d) {
                        return xAxisScale(d[0]);
                    })
                    .y(function(d) {
                        return yAxisScale(d[1]);
                    });
            };

            $scope.isTransversePlane = function() {
                return selectedDicomPlane == 't';
            };

            $scope.load = function(json) {
                if (! selectedDicomPlane) {
                    updateSelectedDicomPlane(appState.models[$scope.modelName].dicomPlane);
                }
                updateCurrentFrame();
                var newFrameId = json.ImagePositionPatient[2];
                if (frameId != newFrameId) {
                    frameId = newFrameId;
                    roiContours = null;
                }
                //console.log('frameId:', frameId);
                var preserveZoom = xValues ? true : false;
                //TODO(pjm): pixels are centered on point, move this to server
                dicomDomain = appState.clone(json.domain);
                dicomDomain[0][0] -= json.PixelSpacing[0] / 2.0;
                dicomDomain[0][1] -= json.PixelSpacing[1] / 2.0;
                xValues = plotting.linspace(0, json.shape[1] * json.PixelSpacing[0] / 1000.0, json.shape[1]);
                yValues = plotting.linspace(0, json.shape[0] * json.PixelSpacing[1] / 1000.0, json.shape[0]);
                cacheCanvas.width = xValues.length;
                cacheCanvas.height = yValues.length;
                imageData = ctx.getImageData(0, 0, cacheCanvas.width, cacheCanvas.height);
                //console.log('canvas size: ', xValues.length, yValues.length);
                select('.x-axis-label').text(plotting.extractUnits($scope, 'x', ' [m]'));
                select('.y-axis-label').text(plotting.extractUnits($scope, 'y', ' [m]'));
                if (! preserveZoom) {
                    xAxisScale.domain(getRange(xValues));
                    yAxisScale.domain(getRange(yValues));
                }
                heatmap = json.pixel_array;
                loadImage();
                $scope.resize();
                robotService.setPlaneCoord(selectedDicomPlane, dicomDomain[0][2]);
            };

            $scope.modelChanged = function() {
                var currentPlane = appState.models[$scope.modelName].dicomPlane;
                if (dicomWindowChanged()) {
                    colorScale = null;
                }
                if (selectedDicomPlane != currentPlane) {
                    clearCache();
                    clearContours();
                    var oldPlane = selectedDicomPlane;
                    updateSelectedDicomPlane(currentPlane);
                    xValues = null;
                    $scope.requestData();
                    if (! $scope.isSubFrame) {
                        ['dicomAnimation2', 'dicomAnimation3'].forEach(function(m) {
                            if (appState.models[m].dicomPlane == currentPlane) {
                                appState.models[m].dicomPlane = oldPlane;
                                appState.saveChanges(m);
                            }
                        });
                    }
                }
                else {
                    loadImage();
                    $scope.resize();
                }
            };

            $scope.resize = function() {
                if (select().empty()) {
                    return;
                }
                var canvasSize = parseInt(select().style('width')) - $scope.margin.left - $scope.margin.right;
                if (isNaN(canvasSize) || ! xValues) {
                    return;
                }
                $scope.canvasSize = canvasSize;
                $scope.canvasHeight = canvasSize * getSize(yValues) / getSize(xValues);
                plotting.ticks(yAxis, $scope.canvasHeight, false);
                plotting.ticks(xAxis, canvasSize, true);
                xAxisScale.range([0, canvasSize]);
                yAxisScale.range([$scope.canvasHeight, 0]);
                refresh();
            };


            $scope.requestData = function() {
                if (! $scope.hasFrames()) {
                    return;
                }
                var index = frameCache.getCurrentFrame($scope.modelName);
                if (frameCache.getCurrentFrame($scope.modelName) == $scope.prevFrameIndex) {
                    return;
                }
                var cache = $scope.requestCache[index];
                if (cache) {
                    if ($scope.isPlaying) {
                        $interval(
                            function() {
                                $scope.load(cache);
                                $scope.advanceFrame(1);
                            },
                            0,
                            1
                        );
                    }
                    else {
                        $scope.load(cache);
                    }
                    $scope.prevFrameIndex = index;
                }
                else {
                    if (inRequest) {
                        return;
                    }
                    inRequest = true;
                    frameCache.getFrame($scope.modelName, index, $scope.isPlaying, function(index, data) {
                        inRequest = false;
                        $scope.prevFrameIndex = index;
                        if ($scope.element) {
                            if (data.error) {
                                panelState.setError($scope.modelName, data.error);
                                return;
                            }
                            $scope.requestCache[index] = data;
                            if (index == frameCache.getCurrentFrame($scope.modelName)) {
                                $scope.load(data);
                            }
                        }
                        if ($scope.isPlaying) {
                            $scope.advanceFrame(1);
                        }
                        else {
                            var current = frameCache.getCurrentFrame($scope.modelName);
                            if (current != index) {
                                $scope.requestData();
                            }
                        }
                    });
                }
            };

            $scope.setZoomMode = function(mode) {
                robotService.zoomMode = mode;
                //TODO(pjm): want all dicoms to refresh, rename roiPointsLoaded
                //refresh();
                $rootScope.$broadcast('roiPointsLoaded');
            };

            $scope.$on('roiPointsLoaded', function() {
                if (xValues) {
                    refresh();
                }
            });

            var redrawIfChanged = function(newValue, oldValue) {
                if ($scope.isTransversePlane() && newValue != oldValue) {
                    redrawContours();
                }
            };
            $scope.$watch('robotService.isEditMode', redrawIfChanged);
            $scope.$watch('robotService.editMode', redrawIfChanged);
        },
        link: function link(scope, element) {
            appState.whenModelsLoaded(scope, function() {
                plotting.linkPlot(scope, element);
            });
        },
    };
});

SIREPO.app.directive('roiTable', function(appState, robotService) {
    return {
        restrict: 'A',
        scope: {
            source: '=controller',
        },
        template: [
            '<button class="btn btn-info btn-xs pull-right"><span class="glyphicon glyphicon-plus"></span> New Region</button>',
            '<table style="width: 100%;  table-layout: fixed" class="table table-hover">',
              '<colgroup>',
                '<col>',
                '<col style="width: 8ex">',
              '</colgroup>',
              '<thead>',
                '<tr>',
                  '<th>Name</th>',
                  '<th style="white-space: nowrap">Color</th>',
                '</tr>',
              '</thead>',
              '<tbody>',
                '<tr data-ng-show="roi.isVisible" data-ng-click="activate(roi)" data-ng-repeat="roi in roiList track by roi.name" data-ng-class="{warning: isActive(roi)}">',
                  '<td style="padding-left: 1em">{{ roi.name }}</td>',
                  '<td><div style="border: 1px solid #333; background-color: {{ d3Color(roi.color) }}">&nbsp;</div></td>',
                '</tr>',
              '</tbody>',
            '</table>',
        ].join(''),
        controller: function($scope) {
            $scope.roiList = null;

            $scope.activate = function(roi) {
                appState.models.dicomSeries.activeRoiNumber = roi.roiNumber;
                appState.saveChanges('dicomSeries');
            };

            $scope.d3Color = function(c) {
                return window.d3 ? d3.rgb(c[0], c[1], c[2]) : '#000';
            };

            $scope.isActive = function(roi) {
                if (appState.isLoaded()) {
                    return appState.models.dicomSeries.activeRoiNumber == roi.roiNumber;
                }
                return false;
            };

            $scope.$on('roiPointsLoaded', function() {
                $scope.roiList = [];
                var rois = robotService.getROIPoints();
                Object.keys(rois).forEach(function(roiNumber) {
                    var roi = rois[roiNumber];
                    roi.roiNumber = roiNumber;
                    if (roi.color) {
                        $scope.roiList.push(roi);
                    }
                });
                $scope.roiList.sort(function(a, b) {
                    return a.name.localeCompare(b.name);
                });
            });
        },
    };
});
