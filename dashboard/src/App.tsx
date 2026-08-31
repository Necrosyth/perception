import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import SplashPage from "./pages/Splash";
import CameraDetail from "./pages/CameraDetail";
import Birdseye from "./pages/Birdseye";
import Live from "./pages/Live";
import Review from "./pages/Review";
import RecordingDetail from "./pages/RecordingDetail";
import Explore from "./pages/Explore";
import Zones from "./pages/Zones";
import System from "./pages/System";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";

export default function App() {
  return (
    <Routes>
      <Route path="/splash" element={<SplashPage />} />
      <Route element={<AppShell />}>
        <Route index element={<Live />} />
        <Route path="camera/:cameraId" element={<CameraDetail />} />
        <Route path="birdseye" element={<Birdseye />} />
        <Route path="review" element={<Review />} />
        <Route path="review/:segmentId" element={<RecordingDetail />} />
        <Route path="explore" element={<Explore />} />
        <Route path="zones" element={<Zones />} />
        <Route path="system" element={<System />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
        <Route path="terms" element={<Terms />} />
        <Route path="privacy" element={<Privacy />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
