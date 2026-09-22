path = "page.jsx"
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# Fix 1: autoPrintCode effect - use a ref instead of state so the effect body
# contains no setState call at all (only a ref mutation + the actual
# side-effect window.print()).
old1 = '''  const [autoPrintCode, setAutoPrintCode] = useState(""); // photo_code yg harus auto-print begitu selectedPhoto sinkron'''
new1 = '''  const autoPrintCodeRef = useRef(""); // photo_code yg harus auto-print begitu selectedPhoto sinkron (ref, bukan state - efeknya cuma perlu BACA, bukan setState)'''
assert s.count(old1) == 1
s = s.replace(old1, new1)

old2 = '''      const hit = allPhotos.find((p) => p.queue_label === digits.padStart(5, "0"));
    if (hit) {
      setSelectedCode(hit.photo_code);
      if (autoPrint) setAutoPrintCode(hit.photo_code);
      return true;
    }
    try {
      const found = await findRpvPhotoByQueue(activeCode, Number(digits));
      if (found) {
        const item = { photo_code: found.photo_code, storage_path: found.storage_path, uploaded_at: found.uploaded_at, is_ai_result: true, url: found.url, queue_no: found.queue_no, queue_label: found.queue_label };
        setAiPhotos((prev) => (prev.some((x) => x.photo_code === item.photo_code) ? prev : [item, ...prev]));
        setSelectedCode(item.photo_code);
        if (autoPrint) setAutoPrintCode(item.photo_code);
        return true;
      }
    } catch { /* tidak ketemu - diamkan, list tetap kefilter kosong */ }
    return false;
  }, [activeCode, allPhotos]);'''
new2 = '''      const hit = allPhotos.find((p) => p.queue_label === digits.padStart(5, "0"));
    if (hit) {
      setSelectedCode(hit.photo_code);
      if (autoPrint) autoPrintCodeRef.current = hit.photo_code;
      return true;
    }
    try {
      const found = await findRpvPhotoByQueue(activeCode, Number(digits));
      if (found) {
        const item = { photo_code: found.photo_code, storage_path: found.storage_path, uploaded_at: found.uploaded_at, is_ai_result: true, url: found.url, queue_no: found.queue_no, queue_label: found.queue_label };
        setAiPhotos((prev) => (prev.some((x) => x.photo_code === item.photo_code) ? prev : [item, ...prev]));
        setSelectedCode(item.photo_code);
        if (autoPrint) autoPrintCodeRef.current = item.photo_code;
        return true;
      }
    } catch { /* tidak ketemu - diamkan, list tetap kefilter kosong */ }
    return false;
  }, [activeCode, allPhotos]);'''
assert s.count(old2) == 1
s = s.replace(old2, new2)

old3 = '''  useEffect(() => {
    if (autoPrintCode && selectedPhoto?.photo_code === autoPrintCode) {
      setAutoPrintCode("");
      window.print();
    }
  }, [autoPrintCode, selectedPhoto]);'''
new3 = '''  useEffect(() => {
    if (autoPrintCodeRef.current && selectedPhoto?.photo_code === autoPrintCodeRef.current) {
      autoPrintCodeRef.current = "";
      window.print();
    }
  }, [selectedPhoto]);'''
assert s.count(old3) == 1
s = s.replace(old3, new3)

# Fix 2: RpvScanSheet mount effect - drop the redundant setState-to-default
# calls (scanning/detected/camErr already start at these exact values from
# useState, so resetting them again on mount is a no-op that only trips the
# lint rule) and stop depending on `onDetect` directly (parent passes a new
# inline arrow every render, which would otherwise restart the camera
# effect/stream constantly) - keep a live ref to it instead, same shape as
# `stop` being a stable useCallback.
old4 = '''  useEffect(() => {
    let alive = true;
    firedRef.current = false;
    setCamErr(""); setScanning(false); setDetected(false);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {'''
new4 = '''  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  useEffect(() => {
    let alive = true;
    firedRef.current = false;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {'''
assert s.count(old4) == 1
s = s.replace(old4, new4)

old5 = '''                if (!firedRef.current) {
                  firedRef.current = true;
                  stop();
                  onDetect(digits);
                  return;
                }'''
new5 = '''                if (!firedRef.current) {
                  firedRef.current = true;
                  stop();
                  onDetectRef.current(digits);
                  return;
                }'''
assert s.count(old5) == 1
s = s.replace(old5, new5)

old6 = "  }, [stop, onDetect]);"
new6 = "  }, [stop]);"
assert s.count(old6) == 1
s = s.replace(old6, new6)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("fix OK")
