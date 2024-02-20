document.addEventListener("DOMContentLoaded", () => {
  const userVideo = document.getElementById("localVideo");
  const remoteVideo = document.getElementById("remoteVideo");
  const joinButton = document.getElementById("joinButton");
  const leaveButton = document.getElementById("leaveButton");
  const recordLocalMediaButton = document.getElementById("recordLocalMediaButton");
  const recordRemoteMediaButton = document.getElementById("recordRemoteMediaButton");
  const localRecordingIndicator = document.getElementById("local-recording-indicator");
  const remoteRecordingIndicator = document.getElementById("remote-recording-indicator");

  let gatewayUrl = "https://v1.liveswitch.fm:8443/sync";
  let applicationId = "my-app-id";
  let sharedSecret = "--replaceThisWithYourOwnSharedSecret--";
  let channelId = (Math.floor(Math.random() * 900000) + 100000).toString();
  let senderClient;
  let receiverClient;
  let senderChannel;
  let receiverChannel;
  let senderUpstreamConnection;
  let localMedia;
  let localVideoDiv;
  let remoteMedia;
  let remoteVideoDiv;
  let recording = [
    {
      recording: false,
      recorder: null,
      recordedChunks: [],
      filenameBase: "local-media",
      button: recordLocalMediaButton,
      indicator: localRecordingIndicator
    },
    {
      recording: false,
      recorder: null,
      recordedChunks: [],
      filenameBase: "remote-media",
      button: recordRemoteMediaButton,
      indicator: remoteRecordingIndicator
    }
  ]

  fm.liveswitch.Log.registerProvider(new fm.liveswitch.ConsoleLogProvider(fm.liveswitch.LogLevel.Debug));

  // Function to set up and display local video
  async function startLocalMedia() {
    try {
      localMedia = new fm.liveswitch.LocalMedia(true, new fm.liveswitch.VideoConfig(640, 480, 30));
      await localMedia.start();
      localVideoDiv = localMedia.getView();
      userVideo.appendChild(localVideoDiv);
    } catch (error) {
      fm.liveswitch.Log.error("Error starting local video.", error);
      throw error;
    }
  }

  // Function for sender to register with LiveSwitch Gateway, join a channel and create upstream connection
  async function senderRegisterAndConnect() {
    let promise = new fm.liveswitch.Promise();
    senderClient = new fm.liveswitch.Client(gatewayUrl, applicationId);
    let channelClaims = [new fm.liveswitch.ChannelClaim(channelId)];
    let token = fm.liveswitch.Token.generateClientRegisterToken(applicationId, senderClient.getUserId(), senderClient.getDeviceId(), senderClient.getId(), null, channelClaims, sharedSecret);
    senderClient.register(token).then(channels => {
      senderChannel = channels[0];
      openSfuUpstreamConnection().then(_ => {
        promise.resolve(null);
      }).catch(ex => {
        promise.reject(ex)
      });
    }).fail(ex => {
      fm.liveswitch.Log.error("Failed to register sender.", ex);
      promise.reject(ex);
    });
    return promise;
  }

  async function openSfuUpstreamConnection() {
    let audioStream = new fm.liveswitch.AudioStream(localMedia);
    let videoStream = new fm.liveswitch.VideoStream(localMedia);
    senderUpstreamConnection = senderChannel.createSfuUpstreamConnection(audioStream, videoStream);
    return senderUpstreamConnection.open().fail(ex => {
      fm.liveswitch.Log.error("Failed to open upstream connection.", ex);
    });
  }

  // Function for receiver to register with LiveSwitch Gateway, join a channel and create downstream connection
  async function receiverRegisterAndConnect() {
    let promise = new fm.liveswitch.Promise();
    receiverClient = new fm.liveswitch.Client(gatewayUrl, applicationId);
    let channelClaims = [new fm.liveswitch.ChannelClaim(channelId)];
    let token = fm.liveswitch.Token.generateClientRegisterToken(applicationId, receiverClient.getUserId(), receiverClient.getDeviceId(), receiverClient.getId(), null, channelClaims, sharedSecret);
    receiverClient.register(token).then(channels => {
      receiverChannel = channels[0];
      receiverChannel.addOnRemoteUpstreamConnectionOpen(openSfuDownstreamConnection);
      promise.resolve(null);
    }).fail(ex => {
      fm.liveswitch.Log.error("Failed to register receiver.", ex);
      promise.reject(ex);
    });
    return promise;
  }

  async function openSfuDownstreamConnection(remoteConnectionInfo) {
    remoteMedia = new fm.liveswitch.RemoteMedia(remoteConnectionInfo.getHasAudio(), remoteConnectionInfo.getHasVideo());
    let audioStream = new fm.liveswitch.AudioStream(remoteMedia);
    let videoStream = new fm.liveswitch.VideoStream(remoteMedia);
    let conn = receiverChannel.createSfuDownstreamConnection(remoteConnectionInfo, audioStream, videoStream);
    return conn.open().then(_ => {
      remoteVideoDiv = remoteMedia.getView();
      remoteVideo.appendChild(remoteVideoDiv);
    }).fail(ex => {
      fm.liveswitch.Log.error("Failed to open downstream connection.", ex);
    });
  }

  // Function to join the call
  async function joinCall() {
    joinButton.disabled = true;
    try {
      await startLocalMedia();
      leaveButton.disabled = false;
      recordLocalMediaButton.disabled = false;
      recordRemoteMediaButton.disabled = false;
    } catch (_) {
      joinButton.disabled = false;
      return;
    }

    senderRegisterAndConnect();
    receiverRegisterAndConnect();
  }

  // Function to leave the call and stop local media
  function leaveCall() {
    leaveButton.disabled = true;

    cleanupRecording();

    if (receiverClient) {
      remoteVideo.removeChild(remoteVideoDiv);
      receiverClient.unregister();
      receiverClient = null;
      receiverChannel = null;
      remoteVideoDiv = null;
    }

    if (senderClient) {
      senderClient.unregister();
      senderClient = null;
      senderChannel = null;
      senderUpstreamConnection = null;
    }

    localMedia.stop();
    userVideo.removeChild(localVideoDiv);
    localMedia = null;
    localVideoDiv = null;

    joinButton.disabled = false;
  }

  function recordLocalMedia() {
    recordMedia(0);
  }

  function recordRemoteMedia() {
    recordMedia(1);
  }

  function recordMedia(index) {
    if (!recording[index].recording && recording[index].recordedChunks.length > 0) {
      downloadRecording(recording[index].recordedChunks, recording[index].filenameBase);
      recording[index].recordedChunks = [];

      recording[index].button.textContent = `Record ${index==0?"Local":"Remote"} Media`;
      if (index == 0 && localMedia == null) {
        recording[index].button.disabled = true;
      }
    } else if (!recording[index].recording) {
      recording[index].recorder = startRecording(index==0?localMedia:remoteMedia);
      recording[index].button.textContent = `Stop ${index==0?"Local":"Remote"} Media Recording`;
      recording[index].indicator.classList.add("fa-video-camera");
      recording[index].recording = true;
    } else {
      stopRecording(recording[index].recorder);
      recording[index].button.textContent = `Download ${index==0?"Local":"Remote"} Media Recording`;
      recording[index].indicator.classList.remove("fa-video-camera");
      recording[index].recording = false;
    }

  }

  function cleanupRecording() {
    if (recording[0].recording) {
      recordMedia(0);
    } else {
      recording[0].button.disabled = true;
    }

    if (recording[1].recording) {
      recordMedia(1);
    } else {
      recording[1].button.disabled = true;
    }
  }

  function downloadRecording(recordedChunks, filenameBase) {
    filename = `${filenameBase}-${new Date().toJSON()}.webm`;
    var blob = new Blob(recordedChunks, { type: "video/webm" });
    var url = (window.URL || window.webkitURL).createObjectURL(blob);
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style = "display: none";
    a.href = url;
    a.download = filename;
    a.click();

    // setTimeout() here is needed for Firefox.
    setTimeout(function () {
      (window.URL || window.webkitURL).revokeObjectURL(url);
    }, 100);
  }

  function startRecording(media) {
    try {
      var recorder = new MediaRecorder(media._getInternal()._getVideoMediaStream());
      recorder.ondataavailable = recorderOnDataAvailable;
      recorder.start(100);
      return recorder;
    } catch (e) {
      console.error("Exception while creating MediaRecorder: " + e);
      return;
    }
  }

  function stopRecording(recorder) {
    recorder.stop();
  }

  function recorderOnDataAvailable(event) {
    if (event.data.size == 0) return;

    var index = 0;
    if (event.target == recording[1].recorder) {
      index = 1;
    }

    recording[index].recordedChunks.push(event.data);
  }

  // Event listeners for buttons
  joinButton.addEventListener("click", joinCall);
  leaveButton.addEventListener("click", leaveCall);
  recordRemoteMediaButton.addEventListener("click", recordRemoteMedia);
  recordLocalMediaButton.addEventListener("click", recordLocalMedia);
});