import { Button } from '@mui/material'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createWorker } from 'tesseract.js'

// see https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints for more information
type ModernMediaTrackCapabilities = MediaTrackCapabilities & {
  // These depend on the device you are using
  // they are indicative of if the capability exists, not its value
  torch?: boolean
  zoom?: {
    max: number
    min: number
  }
  focusMode?: string
}

const ZOOM_STEP = 1
const ZOOM_DEFAULT = 1

const Scanner = () => {
  const ref = useRef<HTMLVideoElement>(null)
  const [capabilities, setCapabilities] = useState<ModernMediaTrackCapabilities | undefined>(undefined)
  const [hasIdentified, setHasIdentfied] = useState(false)

  const [torch, setTorch] = useState(false)
  const [zoom, setZoom] = useState(1)

  /** helper to get an up-to-date constraints object */
  const getVideoTrackConstraints = useCallback(() => {
    if (capabilities === undefined) return {}

    const advanced: Record<string, unknown> = {}

    // Video fokussierung
    if (capabilities.focusMode) {
      advanced.focusMode = 'single-shot'
    }

    // licht
    if (capabilities.torch) {
      advanced.torch = torch
    }

    // zoom
    if (capabilities.zoom && Object.keys(capabilities.zoom).length) {
      advanced.zoom = zoom
    }

    if (Object.keys(advanced).length) {
      return {
        advanced: [advanced],
      } as MediaTrackConstraints
    }

    return {}
  }, [capabilities, torch, zoom])

  /** Initialization of ref and camera */
  useEffect(() => {
    let videoRef: HTMLVideoElement | null = null

    void getDevice().then((res) => {
      if (res === undefined) {
        console.error('No video input device found')
        return
      }

      navigator.mediaDevices
        .getUserMedia({ video: { deviceId: res.deviceId } })
        .then((stream) => {
          if (ref.current && capabilities === undefined) {
            videoRef = ref.current
            ref.current.srcObject = stream
            setCapabilities(stream?.getVideoTracks()?.[0]?.getCapabilities?.())

            // start evaluating screenshots every 100ms

            void scanImageOnRepeat()
          } else {
            console.error('videoRef or videoRef.current is null')
          }
        })
        .catch((error: unknown) => console.error(error))
    })

    // cleanup, we don't want the camera to run after the component has unmounted (tab switch is not covered by this)
    return () => {
      videoRef?.pause()
      getVideoTrack()?.stop()
    }
  }, [])

  // when capabilities are changed, we need to apply them also to the video feed
  useEffect(() => {
    void getVideoTrack()?.applyConstraints?.(getVideoTrackConstraints())
  }, [capabilities, getVideoTrackConstraints])

  async function scanImageOnRepeat() {
    var canvas = document.createElement('canvas')
    canvas.width = ref.current?.clientWidth || 620
    canvas.height = ref.current?.clientHeight || 480
    var ctx = canvas.getContext('2d')

    if (ctx) {
      //draw image to canvas. scale to target dimensions
      ctx.drawImage(document.getElementById('scanningVideo') as HTMLVideoElement, 0, 0, canvas.width, canvas.height)

      //convert to desired file format
      var dataURI = canvas.toDataURL('image/png') // can also use 'image/png'

      const worker = await createWorker(['eng' /*, 'deu'*/], 1)
      const ret = await worker.recognize(dataURI, { rotateAuto: true })
      console.log(ret.data.text)
      await worker.terminate()
    }

    canvas.remove()

    // we only continue the loop, when there is still no match
    // TODO: Evaluate if continuos loop is feasible / makes sense
    /*
    if (!hasIdentified) {
      setTimeout(() => {
        requestAnimationFrame(scanImageOnRepeat)
      }, 1000 / 60)
    }
    */
  }

  function handleDataAvailable(event) {
    console.log(new Blob(event, { type: 'video/webm' }))
  }

  /** Get (video)-camera device */
  async function getDevice() {
    // the last videoinput will most likely be the normal back facing camera according to the internet
    return (await navigator.mediaDevices.enumerateDevices()).reverse().find((device) => device.kind == 'videoinput')
  }

  /**
   * returns the videotrack (MediaStreamTrack) of the srcObject
   */
  function getVideoTrack() {
    const srcObject = ref.current?.srcObject
    if (srcObject) {
      return (srcObject as MediaStream)?.getVideoTracks()?.[0]
    }
  }

  /** functions for user interaction **/

  function calculateNewZoom(): number {
    const max = capabilities?.zoom?.max || ZOOM_DEFAULT
    const newZoom = zoom + ZOOM_STEP

    return newZoom <= max ? newZoom : ZOOM_DEFAULT
  }

  // licht an/aus
  function toggleTorch() {
    setTorch((prev) => !prev)
  }

  // zoom erhöhen bzw. resetten wenn > max
  function toggleZoom() {
    setZoom(calculateNewZoom())
  }

  return (
    <div className="flex-col">
      <video id="scanningVideo" autoPlay={true} ref={ref} style={{ width: '80vw', height: '90vh' }}>
        <track default kind="captions" />
      </video>
      {capabilities && (
        <div className="flex flex-row gap-16 justify-center">
          <Button onClick={scanImageOnRepeat}>👁️</Button>
          {capabilities.torch && <Button onClick={toggleTorch}>🔦</Button>}
          {capabilities?.zoom && <Button onClick={toggleZoom}>🔎</Button>}
        </div>
      )}
    </div>
  )
}

export default Scanner
