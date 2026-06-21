import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

interface UseProctoringProps {
  testStarted: boolean;
  testSubmitted: boolean;
  isMobile: boolean;
  logViolation: (type: string, details: string) => Promise<void>;
}

export function useProctoring({
  testStarted,
  testSubmitted,
  isMobile,
  logViolation,
}: UseProctoringProps) {
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [faceViolation, setFaceViolation] = useState<"none" | "no_face" | "multiple_faces">("none");
  const modelRef = useRef<any>(null);

  // Link webcam stream to video element
  useEffect(() => {
    if (webcamStream && videoRef.current) {
      videoRef.current.srcObject = webcamStream;
    }
  }, [webcamStream]);

  // Cleanup webcam on unmount
  useEffect(() => {
    return () => {
      if (webcamStream) {
        try {
          webcamStream.getTracks().forEach((track) => track.stop());
        } catch {}
      }
    };
  }, [webcamStream]);

  // Load models dynamically when test is started (skipped on mobile)
  useEffect(() => {
    if (!testStarted || isMobile) return;

    let active = true;
    const loadScripts = async () => {
      try {
        if (!(window as any).tf) {
          const tfScript = document.createElement("script");
          tfScript.src = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs";
          tfScript.async = true;
          document.body.appendChild(tfScript);
          await new Promise((resolve) => (tfScript.onload = resolve));
        }

        if (!(window as any).blazeface) {
          const bfScript = document.createElement("script");
          bfScript.src = "https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface";
          bfScript.async = true;
          document.body.appendChild(bfScript);
          await new Promise((resolve) => (bfScript.onload = resolve));
        }

        if (active && (window as any).blazeface) {
          console.log("Loading BlazeFace model...");
          const model = await (window as any).blazeface.load();
          modelRef.current = model;
          setModelLoaded(true);
          console.log("BlazeFace model loaded successfully.");
        }
      } catch (err) {
        console.error("Failed to load face detection models:", err);
      }
    };

    loadScripts();

    return () => {
      active = false;
    };
  }, [testStarted, isMobile]);

  // Periodic Face Proctoring Checks
  useEffect(() => {
    if (isMobile || !modelLoaded || !webcamStream || !videoRef.current || testSubmitted) return;

    const detectFace = async () => {
      if (!videoRef.current || !modelRef.current || testSubmitted) return;

      try {
        if (videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0) {
          const predictions = await modelRef.current.estimateFaces(videoRef.current, false);

          if (predictions.length === 0) {
            setFaceViolation("no_face");
            logViolation("no_face_detected", "No face detected in webcam feed.");
          } else if (predictions.length > 1) {
            setFaceViolation("multiple_faces");
            logViolation("multiple_faces_detected", "Multiple faces detected in webcam feed!");
          } else {
            setFaceViolation("none");
          }
        }
      } catch {
        console.error("Face detection check failed");
      }
    };

    const intervalId = setInterval(detectFace, 2000);
    return () => clearInterval(intervalId);
  }, [modelLoaded, webcamStream, testSubmitted, isMobile, logViolation]);

  const startWebcam = async () => {
    if (!isMobile && !webcamStream && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setWebcamStream(stream);
      } catch (camErr) {
        console.warn("Webcam blocked or not available:", camErr);
        toast.error("Proctoring webcam connection is recommended for identity verification.");
      }
    }
  };

  const stopWebcam = React.useCallback(() => {
    if (webcamStream) {
      try {
        webcamStream.getTracks().forEach((track) => track.stop());
      } catch {}
      setWebcamStream(null);
    }
  }, [webcamStream]);

  return {
    webcamStream,
    videoRef,
    modelLoaded,
    faceViolation,
    startWebcam,
    stopWebcam,
    setWebcamStream,
    setFaceViolation,
  };
}
