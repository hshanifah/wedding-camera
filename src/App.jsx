import React, { useState, useRef, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { QRCodeSVG } from 'qrcode.react';
import { Camera, Image as ImageIcon, QrCode, Sparkles, RefreshCw, Send, Heart, Download } from 'lucide-react';

export default function App() {
  const [view, setView] = useState('camera');
  const [guestName, setGuestName] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [quota, setQuota] = useState(15);
  const [uploading, setUploading] = useState(false);
  
  const videoRef = useRef(null);

  // Ambil galeri foto dari Supabase
  const fetchPhotos = async () => {
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setPhotos(data);
  };

  useEffect(() => {
    fetchPhotos();
    const channel = supabase
      .channel('public:photos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos' }, (payload) => {
        setPhotos((prev) => [payload.new, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Gagal mengakses kamera:", err);
    }
  };

  useEffect(() => {
    if (isRegistered && view === 'camera' && !photo) {
      startCamera();
    }
  }, [isRegistered, view, photo]);

  const capturePhoto = () => {
    if (quota <= 0) {
      alert("Kuota jepretan Anda sudah habis!");
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    
    setPhoto(canvas.toDataURL('image/jpeg'));
    setQuota((prev) => prev - 1);
  };

  const sendPhotoToGallery = async () => {
    if (!photo) return;
    setUploading(true);
    try {
      const res = await fetch(photo);
      const blob = await res.blob();
      const fileName = `wedding_${Date.now()}.jpg`;
      const filePath = `public/${fileName}`;

      const { error: storageError } = await supabase.storage
        .from('wedding-photos')
        .upload(filePath, blob);

      if (storageError) throw storageError;

      const { data: publicURLData } = supabase.storage
        .from('wedding-photos')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('photos')
        .insert([{ guest_name: guestName, image_url: publicURLData.publicUrl }]);

      if (dbError) throw dbError;

      alert("Yeay! Foto berhasil dibagikan ke galeri! ✨");
      setPhoto(null);
      setView('gallery');
    } catch (error) {
      console.error(error);
      const newEntry = {
        id: Date.now(),
        guest_name: guestName,
        image_url: photo,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setPhotos((prev) => [newEntry, ...prev]);
      setPhoto(null);
      setView('gallery');
    } finally {
      setUploading(false);
    }
  };

  // Fungsi Download Foto Ber-frame Photobooth
  const handleDownloadWithFrame = (imageUrl, guest) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = 800;
      canvas.height = 1050;

      // Background Frame Warm White
      ctx.fillStyle = '#FDFBF7';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Watermark Atas
      ctx.fillStyle = '#292524';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('H A P P I L Y   E V E R   A F T E R', canvas.width / 2, 65);

      // Area Foto Utama
      const imgX = 70;
      const imgY = 100;
      const imgWidth = 660;
      const imgHeight = 740;

      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
      ctx.shadowBlur = 15;
      ctx.fillRect(imgX, imgY, imgWidth, imgHeight);
      ctx.restore();

      const hRatio = imgWidth / img.width;
      const vRatio = imgHeight / img.height;
      const ratio = Math.max(hRatio, vRatio);
      const centerShiftX = (imgWidth - img.width * ratio) / 2;
      const centerShiftY = (imgHeight - img.height * ratio) / 2;

      ctx.save();
      ctx.beginPath();
      ctx.rect(imgX, imgY, imgWidth, imgHeight);
      ctx.clip();
      ctx.drawImage(img, 0, 0, img.width, img.height, imgX + centerShiftX, imgY + centerShiftY, img.width * ratio, img.height * ratio);
      ctx.restore();

      // Dekorasi Hati
      ctx.fillStyle = '#1c1917';
      ctx.font = '24px serif';
      ctx.fillText('♡', canvas.width / 2, 890);

      // Footer: Wedding of Hani & Memed
      ctx.font = 'italic 32px serif';
      ctx.fillStyle = '#1c1917';
      ctx.fillText('Wedding of Hani & Memed', canvas.width / 2, 945);

      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#78716c';
      ctx.fillText('Photographer: ' + (guest || 'Tamu Undangan'), canvas.width / 2, 990);

      const link = document.createElement('a');
      link.download = `Wedding-Hani-Memed-${Date.now()}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    };
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#050505', color: '#f5f5f4', fontFamily: 'sans-serif', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0' }}>
      
      {/* WRAPPER UTAMA: Berbentuk bingkai HP di Laptop/Desktop, Full-Screen di Smartphone */}
      <div style={{ width: '100%', maxWidth: '430px', minHeight: '100vh', backgroundColor: '#09090b', display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(0,0,0,0.8)', position: 'relative', overflow: 'hidden' }}>
        
        {/* Header Elegan */}
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f1f23', backgroundColor: '#09090b', position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Heart style={{ width: '16px', height: '16px', color: '#f43f5e', fill: '#f43f5e' }} />
            <h2 style={{ fontSize: '15px', fontFamily: 'serif', color: '#fbcfe8', margin: 0, letterSpacing: '0.5px' }}>Hani & Memed</h2>
          </div>
          <div style={{ display: 'flex', gap: '4px', background: '#18181b', padding: '3px', borderRadius: '20px', border: '1px solid #27272a' }}>
            <button onClick={() => setView('camera')} style={{ background: view === 'camera' ? '#e11d48' : 'transparent', color: view === 'camera' ? 'white' : '#a1a1aa', border: 'none', padding: '5px 10px', borderRadius: '16px', fontSize: '11px', cursor: 'pointer', fontWeight: '500', transition: '0.2s' }}>Kamera</button>
            <button onClick={() => setView('gallery')} style={{ background: view === 'gallery' ? '#e11d48' : 'transparent', color: view === 'gallery' ? 'white' : '#a1a1aa', border: 'none', padding: '5px 10px', borderRadius: '16px', fontSize: '11px', cursor: 'pointer', fontWeight: '500', transition: '0.2s' }}>Galeri ({photos.length})</button>
            <button onClick={() => setView('admin')} style={{ background: view === 'admin' ? '#e11d48' : 'transparent', color: view === 'admin' ? 'white' : '#a1a1aa', border: 'none', padding: '5px 10px', borderRadius: '16px', fontSize: '11px', cursor: 'pointer', fontWeight: '500', transition: '0.2s' }}>QR</button>
          </div>
        </div>

        {/* Konten Utama */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', paddingBottom: '40px' }}>
          
          {/* TAMPILAN 1: KAMERA & REGISTRASI TAMU */}
          {view === 'camera' && (
            <div>
              {!isRegistered ? (
                <div style={{ background: '#121216', border: '1px solid #27272a', padding: '28px 20px', borderRadius: '24px', marginTop: '60px', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                  <Sparkles style={{ width: '32px', height: '32px', color: '#f43f5e', margin: '0 auto 14px' }} />
                  <h3 style={{ fontFamily: 'serif', fontSize: '22px', marginBottom: '8px', color: '#fbcfe8' }}>Wedding Disposable Camera</h3>
                  <p style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '24px', lineHeight: '1.5' }}>Masukkan nama Anda untuk mulai mengabadikan momen spesial di pernikahan Hani & Memed.</p>
                  <input 
                    type="text" 
                    placeholder="Ketik Nama Lengkap Anda..." 
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    style={{ width: '100%', background: '#09090b', border: '1px solid #3f3f46', color: 'white', padding: '14px', borderRadius: '14px', fontSize: '14px', textAlign: 'center', marginBottom: '16px', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <button 
                    onClick={() => { if(guestName.trim()) setIsRegistered(true); else alert('Mohon isi nama terlebih dahulu!'); }}
                    style={{ width: '100%', background: '#e11d48', color: 'white', border: 'none', padding: '14px', borderRadius: '14px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', boxShadow: '0 4px 15px rgba(225, 29, 72, 0.4)' }}
                  >
                    Mulai Memotret 📸
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', fontSize: '12px', color: '#a1a1aa', padding: '0 4px' }}>
                    <span>Fotografer: <strong style={{ color: '#fbcfe8' }}>{guestName}</strong></span>
                    <span style={{ background: '#18181b', border: '1px solid #27272a', padding: '4px 10px', borderRadius: '12px', color: '#f43f5e', fontWeight: 'bold' }}>Sisa Jepretan: {quota} 🎞️</span>
                  </div>
                  
                  {!photo ? (
                    <div style={{ position: 'relative', width: '1000px', flex: 1, minHeight: '420px', background: 'black', borderRadius: '20px', overflow: 'hidden', border: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      
                      {/* Tombol Jepret Estetik ala Kamera */}
                      <button 
                        onClick={capturePhoto} 
                        style={{ position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', width: '72px', height: '72px', background: 'white', borderRadius: '50%', border: '4px solid #d4d4d8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 20px rgba(0,0,0,0.6)', active: { transform: 'translateX(-50%) scale(0.95)' } }}
                      >
                        <div style={{ width: '54px', height: '54px', background: '#e11d48', borderRadius: '50%' }}></div>
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: '100%', aspectRatio: '3/4', borderRadius: '20px', overflow: 'hidden', border: '1px solid #27272a', marginBottom: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.6)' }}>
                        <img src={photo} alt="Hasil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                        <button onClick={() => setPhoto(null)} style={{ flex: 1, background: '#18181b', color: 'white', border: '1px solid #27272a', padding: '14px', borderRadius: '14px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>Ulangi Foto</button>
                        <button onClick={sendPhotoToGallery} disabled={uploading} style={{ flex: 1, background: '#e11d48', color: 'white', border: 'none', padding: '14px', borderRadius: '14px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', boxShadow: '0 4px 15px rgba(225, 29, 72, 0.4)' }}>
                          {uploading ? 'Mengirim...' : 'Kirim ke Galeri ✨'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAMPILAN 2: GALERI FOTO BERSAMA */}
          {view === 'gallery' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontFamily: 'serif', fontSize: '20px', color: '#fbcfe8', marginBottom: '6px' }}>Galeri Momen Pernikahan</h3>
                <p style={{ fontSize: '12px', color: '#a1a1aa' }}>Kumpulan foto candid spesial dari para tamu.</p>
              </div>
              
              {photos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#71717a', fontSize: '13px' }}>Belum ada foto yang dibagikan. Jadilah yang pertama!</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {photos.map((item) => (
                    <div key={item.id} style={{ background: '#121216', border: '1px solid #27272a', borderRadius: '16px', overflow: 'hidden', textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <img src={item.image_url} alt="Foto Tamu" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} />
                        <div style={{ padding: '8px 10px 4px', fontSize: '11px', color: '#d4d4d8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#fbcfe8', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{item.guest_name}</span>
                        </div>
                      </div>
                      <div style={{ padding: '0 10px 10px' }}>
                        <button 
                          onClick={() => handleDownloadWithFrame(item.image_url, item.guest_name)}
                          style={{ width: '100%', background: '#1f1f23', color: '#fbcfe8', border: '1px solid #3f3f46', padding: '8px', borderRadius: '10px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 'bold', transition: '0.2s' }}
                        >
                          <Download style={{ width: '12px', height: '12px' }} /> Simpan 🎞️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAMPILAN 3: QR CODE */}
          {view === 'admin' && (
            <div style={{ background: '#121216', border: '1px solid #27272a', padding: '28px 20px', borderRadius: '24px', textAlign: 'center' }}>
              <QrCode style={{ width: '32px', height: '32px', color: '#f43f5e', margin: '0 auto 14px' }} />
              <h3 style={{ fontFamily: 'serif', fontSize: '18px', marginBottom: '8px', color: '#fbcfe8' }}>QR Code Meja Tamu</h3>
              <p style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '20px', lineHeight: '1.5' }}>Scan QR Code ini menggunakan kamera HP untuk mulai mengambil foto di meja Anda.</p>
              <div style={{ background: 'white', padding: '16px', borderRadius: '16px', display: 'inline-block', marginBottom: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}>
                <QRCodeSVG value="http://localhost:5173" size={160} />
              </div>
              <div style={{ fontSize: '10px', color: '#71717a', wordBreak: 'break-all' }}>http://localhost:5173</div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}