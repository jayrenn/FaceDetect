(function () {
    "use strict";

    var FaceDetect = (function () {
        // Configurations
        var detectionInterval = 33; // 33ms is fastest, 200ms is default.
        var faceboxColors = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22"]; // Hex color values for each facebox; will cycle if there are more faceboxes than colors.
        var mirroring = true; // If true, video preview will show you as you see yourself in the mirror.
        var targetResolutionHeight = 480; // Height of target video resolution (e.g. 480, 720, 1080) at 30fps. Will fall back to device default if target setting not found.
        var targetFrameRateNumerator = 30; // Numerator of the frame rate (e.g. 30:1).

        // Initializations
        var buttonTakePhoto, mediaCapture, facesCanvas, video, snapshot, effect, props;
        var Capture = Windows.Media.Capture;
        var captureSettings = new Capture.MediaCaptureInitializationSettings;
        var DeviceEnumeration = Windows.Devices.Enumeration;
        var displayRequest = new Windows.System.Display.DisplayRequest();
        var effectDefinition = new Windows.Media.Core.FaceDetectionEffectDefinition();
        var mediaStreamType = Capture.MediaStreamType.videoPreview;
        var inPreview = false;

        // Add the face detection video effect
        function addDetection(that, withPreview) {
            // Get the current camera settings
            props = mediaCapture.videoDeviceController.getMediaStreamProperties(mediaStreamType);

            mediaCapture.addVideoEffectAsync(effectDefinition, mediaStreamType).done(
                function complete(result) {
                    effect = result;
                    effect.addEventListener("facedetected", handleFaces);
                    effect.desiredDetectionInterval = detectionInterval;
                    buttonTakePhoto.addEventListener("click", function () {
                        that.takePhoto();
                    });
                },
                function error(e) {
                    console.error(e);
                }
            );

            if (withPreview) {
                that.startPreview();
            }
        }

        // Remove any previous snapshots
        function clearSnapshot() {
            while (snapshot.hasChildNodes()) {
                snapshot.removeChild(snapshot.lastChild);
            }
        }

        // Use the first camera available
        function findCameraDeviceByPanelAsync(panel) {
            return DeviceEnumeration.DeviceInformation.findAllAsync(DeviceEnumeration.DeviceClass.videoCapture).then(
                function (devices) {
                    return devices.length > 0 ? devices.getAt(0) : null;
                }
            );
        }

        // Draw faceboxes for each detected face
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

        // Mirror the video
        function handlePreview() {
            if (mirroring) {
                props.properties.insert("C380465D-2271-428C-9B83-ECEA3B4A85C1", 0);
                return mediaCapture.setEncodingPropertiesAsync(mediaStreamType, props, null);
            }
        }

        // Convert binary to base64
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
            // Begin face detection
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

                    findCameraDeviceByPanelAsync(DeviceEnumeration.Panel.back).then(
                        function (camera) {
                            if (!camera) {
                                console.error("No camera device found!");
                                return;
                            }

                            mediaCapture = new Capture.MediaCapture();
                            captureSettings.videoDeviceId = camera.id;
                            captureSettings.streamingCaptureMode = Capture.StreamingCaptureMode.video;

                            // Initialize the camera
                            mediaCapture.initializeAsync(captureSettings).then(
                                function fulfilled(result) {
                                    // Attempt to use the target camera settings
                                    var controller = mediaCapture.videoDeviceController;
                                    var availableProps = controller.getAvailableMediaStreamProperties(mediaStreamType);
                                    var foundProp = false;
                                    availableProps.forEach(function (prop) {
                                        if (prop.height == targetResolutionHeight && prop.frameRate.numerator == targetFrameRateNumerator) {
                                            foundProp = true;
                                            controller.setMediaStreamPropertiesAsync(mediaStreamType, prop).done(function () {
                                                addDetection(that, withPreview);
                                            });
                                            return;
                                        }
                                    });

                                    if (!foundProp) {
                                        addDetection(that, withPreview);
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
            // End face detection
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
            // Show the video preview
            startPreview: function () {
                if (!inPreview) {
                    displayRequest.requestActive();
                    var preview = document.getElementById("cameraPreview");

                    // Size the video and canvas elements to match the camera resolution
                    var width = props.width;
                    var height = props.height;
                    video.style.width = preview.style.width = width + "px";
                    video.style.height = preview.style.height = height + "px";
                    facesCanvas.width = width;
                    facesCanvas.height = height;
                    preview.addEventListener("playing", handlePreview);

                    if (mirroring) {
                        preview.style.transform = "scale(-1, 1)";
                    }

                    var previewUrl = URL.createObjectURL(mediaCapture);
                    preview.src = previewUrl;
                    preview.play();
                    inPreview = true;
                }
            },
            // Hide the video preview
            stopPreview: function () {
                if (inPreview) {
                    facesCanvas.getContext("2d").clearRect(0, 0, facesCanvas.width, facesCanvas.height);
                    var preview = document.getElementById("cameraPreview");
                    video.style.width = video.style.height = preview.style.width = preview.style.height = facesCanvas.width = facesCanvas.height = 0;
                    preview.pause();
                    preview.src = null;
                    displayRequest.requestRelease();
                    inPreview = false;
                }
            },
            // Take a photo using the video stream
            takePhoto: function () {
                if (mediaCapture) {
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
                            var base64 = Uint8ToBase64(byteArray);
                            var img = document.createElement("img");
                            img.src = "data: image/jpeg;base64," + base64;

                            if (mirroring) {
                                img.style.transform = "scale(-1, 1)";
                            }

                            clearSnapshot();
                            snapshot.appendChild(img);
                        });
                    });
                }
            }
        }
    })();

    window.FaceDetect = FaceDetect;
})();