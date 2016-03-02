(function () {
    "use strict";

    var FaceDetect = (function () {
        // Configurations
        var detectionInterval = 33; // 33ms is fastest, 200ms is default
        var faceboxColors = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22"]; // Hex color values for each facebox; will cycle if there are more faceboxes than colors
        var mirroring = true; // If true, video preview will show you as you see yourself in the mirror

        // Initializations
        var buttonTakePhoto, mediaCapture, facesCanvas, video, snapshot, effect;
        var Capture = Windows.Media.Capture;
        var captureSettings = new Capture.MediaCaptureInitializationSettings;
        var DeviceEnumeration = Windows.Devices.Enumeration;
        var displayRequest = new Windows.System.Display.DisplayRequest();
        var effectDefinition = new Windows.Media.Core.FaceDetectionEffectDefinition();
        var mediaStreamType = Capture.MediaStreamType.videoRecord;
        var inPreview = false;

        function clearSnapshot() {
            while (snapshot.hasChildNodes()) {
                snapshot.removeChild(snapshot.lastChild);
            }
        }

        function findCameraDeviceByPanelAsync(panel) {
            var deviceInfo;
            return DeviceEnumeration.DeviceInformation.findAllAsync(DeviceEnumeration.DeviceClass.videoCapture).then(
                function (devices) {
                    devices.forEach(function (cameraDeviceInfo) {
                        if (cameraDeviceInfo.enclosureLocation != null && cameraDeviceInfo.enclosureLocation.panel === panel) {
                            deviceInfo = cameraDeviceInfo;
                            return;
                        }
                    });

                    return !deviceInfo && devices.length > 0 ? devices.getAt(0) : deviceInfo;
                }
            );
        }

        function handleFaces(args) {
            if (inPreview) {
                var context = facesCanvas.getContext("2d");
                context.clearRect(0, 0, facesCanvas.width, facesCanvas.height);
                var detectedFaces = args.resultFrame.detectedFaces;
                var numFaces = detectedFaces.length;
                if (numFaces > 0) {
                    var face;

                    for (var i = 0; i < numFaces; i++) {
                        face = detectedFaces.getAt(i).faceBox;
                        context.beginPath();
                        context.rect(face.x, face.y, face.width, face.height);
                        context.lineWidth = 3;
                        context.strokeStyle = faceboxColors[i % faceboxColors.length];
                        context.stroke();
                        context.closePath();

                        if (mirroring) {
                            facesCanvas.style.transform = "scale(-1, 1)";
                        }
                    }
                }
            }
        }

        function mirrorPreview() {
            var props = mediaCapture.videoDeviceController.getMediaStreamProperties(Capture.MediaStreamType.videoPreview);
            props.properties.insert("C380465D-2271-428C-9B83-ECEA3B4A85C1", 0);
            return mediaCapture.setEncodingPropertiesAsync(Capture.MediaStreamType.videoPreview, props, null);
        }

        function Uint8ToBase64(u8Arr) {
            var CHUNK_SIZE = 0x8000;
            var index = 0;
            var length = u8Arr.length;
            var result = "";
            var slice;
            while (index < length) {
                slice = u8Arr.subarray(index, Math.min(index + CHUNK_SIZE, length));
                result += String.fromCharCode.apply(null, slice);
                index += CHUNK_SIZE;
            }
            return btoa(result);
        }

        return {
            startDetection: function (withPreview) {
                if (typeof withPreview == "undefined") {
                    withPreview = true;
                }

                var that = this;

                if (!mediaCapture) {
                    buttonTakePhoto = document.getElementById("buttonTakePhoto");
                    facesCanvas = document.getElementById("facesCanvas");
                    snapshot = document.getElementById("snapshot");
                    video = document.getElementById("video");

                    facesCanvas.width = video.offsetWidth;
                    facesCanvas.height = video.offsetHeight;

                    findCameraDeviceByPanelAsync(DeviceEnumeration.Panel.back).then(
                        function (camera) {
                            if (!camera) {
                                console.error("No camera device found!");
                                return;
                            }

                            mediaCapture = new Capture.MediaCapture();
                            captureSettings.videoDeviceId = camera.id;
                            captureSettings.streamingCaptureMode = Capture.StreamingCaptureMode.video;
                            mediaCapture.initializeAsync(captureSettings).then(
                                function fulfilled(result) {
                                    mediaCapture.addVideoEffectAsync(effectDefinition, mediaStreamType).done(
                                        function complete(result) {
                                            effect = result;
                                            effect.addEventListener("facedetected", handleFaces);
                                            effect.desiredDetectionInterval = detectionInterval;
                                            buttonTakePhoto.addEventListener("click", function () {
                                                that.takePhoto(true);
                                            });
                                        },
                                        function error(e) {
                                            console.error(e);
                                        }
                                    );

                                    if (withPreview) {
                                        that.startPreview();
                                    }
                                },
                                function error(e) {
                                    console.error(e);
                                }
                            );
                        }
                    );
                }
            },
            stopDetection: function () {
                effect.removeEventListener("facedetected", handleFaces);
                facesCanvas.getContext("2d").clearRect(0, 0, facesCanvas.width, facesCanvas.height);

                mediaCapture.clearEffectsAsync(mediaStreamType).then(function () {
                    effect = null;
                });

                if (inPreview) {
                    this.stopPreview();
                }

                mediaCapture.close();
                mediaCapture = null;
                clearSnapshot();
            },
            startPreview: function () {
                if (!inPreview) {
                    displayRequest.requestActive();
                    var preview = document.getElementById("cameraPreview");

                    if (mirroring) {
                        preview.style.transform = "scale(-1, 1)";
                        preview.addEventListener("playing", mirrorPreview);
                    }

                    var previewUrl = URL.createObjectURL(mediaCapture);
                    preview.src = previewUrl;
                    preview.play();
                    inPreview = true;
                }
            },
            stopPreview: function () {
                if (inPreview) {
                    facesCanvas.getContext("2d").clearRect(0, 0, facesCanvas.width, facesCanvas.height);
                    var preview = document.getElementById("cameraPreview");
                    preview.pause();
                    preview.src = null;
                    displayRequest.requestRelease();
                    inPreview = false;
                }
            },
            takePhoto: function (showPreview) {
                if (!showPreview) {
                    showPreview = false;
                }

                var Storage = Windows.Storage;
                var stream = new Storage.Streams.InMemoryRandomAccessStream();
                mediaCapture.capturePhotoToStreamAsync(Windows.Media.MediaProperties.ImageEncodingProperties.createJpeg(), stream)
                .then(function () {
                    var buffer = new Storage.Streams.Buffer(stream.size);
                    stream.seek(0);
                    stream.readAsync(buffer, stream.size, 0).done(function () {
                        var dataReader = Storage.Streams.DataReader.fromBuffer(buffer);
                        var byteArray = new Uint8Array(buffer.length);
                        dataReader.readBytes(byteArray);

                        if (showPreview) {
                            var base64 = Uint8ToBase64(byteArray);
                            var img = document.createElement("img");
                            img.src = "data: image/jpeg;base64," + base64;

                            if (mirroring) {
                                img.style.transform = "scale(-1, 1)";
                            }

                            clearSnapshot();
                            snapshot.appendChild(img);
                        }

                        return byteArray;
                    });
                });
            }
        }
    })();

    window.FaceDetect = FaceDetect;
})();