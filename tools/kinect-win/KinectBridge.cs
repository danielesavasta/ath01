// Kinect (Xbox 360 / Kinect for Windows v1, or Kinect One / v2) -> browser bridge for Windows.
//
// The default build uses Kinect for Windows SDK 1.8; define KINECTV2 to use Kinect for Windows SDK 2.0.
// Both builds speak the same language as tools/kinect/bridge.py, so the page does not change:
//
//     ws://127.0.0.1:8770/hands   JSON, every skeleton frame: { w, h, hands: [{ x, y, z, bx, side, closed }],
//                                  bg, learning, skeleton: true }. x, y are 0..1 of the (unmirrored) depth
//                                  picture, z in mm; only hands raised above the hips are sent.
//     ws://127.0.0.1:8770/depth   the depth picture as JPEG (people lit), for the setup screen (K)
//     http://127.0.0.1:8770/...   the installation itself (the repo's files), so the PC needs no web server
//
// Build with tools/kinect-win/build.bat (no Visual Studio needed). Start with start-windows.bat in the repo
// root. Written for the C# 5 compiler that comes with Windows (csc of .NET Framework 4.x).

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using Microsoft.Kinect;
#if !KINECTV2 && !NOGRIP
using Microsoft.Kinect.Toolkit.Interaction;
#endif

namespace Athena
{
    static class Program
    {
        static int port = 8770;
        static string root;
        static double raise = 0.10;     // m a hand must be above the hips to count (arms hanging are ignored)

        static void Main(string[] args)
        {
            root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", ".."));
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "--port") port = int.Parse(args[i + 1]);
                if (args[i] == "--root") root = Path.GetFullPath(args[i + 1]);
                if (args[i] == "--raise") raise = double.Parse(args[i + 1], CultureInfo.InvariantCulture);
            }
#if KINECTV2
            Console.WriteLine("Athena Kinect One bridge (body tracking)");
#else
            Console.WriteLine("Athena Kinect 360 bridge (skeleton" +
#if NOGRIP
                ", no grip: Developer Toolkit not found at build time" +
#else
                " + grip" +
#endif
                ")");
#endif
            Console.WriteLine("Serving " + root);
            Server.Start(port, root);
            Console.WriteLine("Open http://localhost:" + port + "/index.htm   (Ctrl-C to stop)");
            var kinect = new Tracker(raise);
            while (true)
            {
                if (!kinect.Running) kinect.TryStart();
                Thread.Sleep(2000);
            }
        }
    }

    // ───────────── Kinect: body tracking, hand state, depth picture ─────────────
#if KINECTV2
    class Tracker
    {
        const int W = 512, H = 424;
        KinectSensor sensor;
        BodyFrameReader bodyReader;
        DepthFrameReader depthReader;
        Body[] bodies;
        ushort[] depth;
        readonly double raise;
        DateTime lastPicture = DateTime.MinValue;
        DateTime lastActivity = DateTime.MinValue;
        bool waitingSaid;

        public Tracker(double raise) { this.raise = raise; }
        // IsAvailable only turns true some time after Open(), so judge by frames: restart only after 6 s of silence
        public bool Running { get { return sensor != null && sensor.IsOpen && (DateTime.Now - lastActivity).TotalSeconds < 6; } }

        public void TryStart()
        {
            try
            {
                StopSensor();
                sensor = KinectSensor.GetDefault();
                if (sensor == null)
                {
                    if (!waitingSaid) Console.WriteLine("No Kinect One yet (USB 3.0 and power adapter?). Waiting...");
                    waitingSaid = true;
                    return;
                }

                waitingSaid = false;
                bodies = new Body[sensor.BodyFrameSource.BodyCount];
                depth = new ushort[W * H];
                bodyReader = sensor.BodyFrameSource.OpenReader();
                depthReader = sensor.DepthFrameSource.OpenReader();
                bodyReader.FrameArrived += OnBodyFrame;
                depthReader.FrameArrived += OnDepthFrame;
                lastActivity = DateTime.Now;
                sensor.Open();
                Console.WriteLine("Kinect One started.");
            }
            catch (Exception e)
            {
                Console.WriteLine("Kinect One could not start: " + e.Message);
                StopSensor();
            }
        }

        void StopSensor()
        {
            if (bodyReader != null)
            {
                bodyReader.FrameArrived -= OnBodyFrame;
                bodyReader.Dispose();
                bodyReader = null;
            }
            if (depthReader != null)
            {
                depthReader.FrameArrived -= OnDepthFrame;
                depthReader.Dispose();
                depthReader = null;
            }
            if (sensor != null)
            {
                try { sensor.Close(); } catch { }
                sensor = null;
            }
        }

        void OnBodyFrame(object sender, BodyFrameArrivedEventArgs e)
        {
            lastActivity = DateTime.Now;
            using (var frame = e.FrameReference.AcquireFrame())
            {
                if (frame == null) return;
                frame.GetAndRefreshBodyData(bodies);
            }
            if (!Server.Wants("hands")) return;

            var json = new StringBuilder();
            json.Append("{\"w\":").Append(W).Append(",\"h\":").Append(H)
                .Append(",\"bg\":true,\"learning\":null,\"skeleton\":true,\"hands\":[");
            bool first = true;
            foreach (var body in bodies)
            {
                if (body == null || !body.IsTracked) continue;
                Joint hip = body.Joints[JointType.SpineBase];
                if (hip.TrackingState == TrackingState.NotTracked) continue;
                Joint spine = body.Joints[JointType.SpineShoulder];
                DepthSpacePoint bodyPoint = sensor.CoordinateMapper.MapCameraPointToDepthSpace(spine.Position);
                foreach (JointType jointType in new[] { JointType.HandRight, JointType.HandLeft })
                {
                    Joint hand = body.Joints[jointType];
                    if (hand.TrackingState == TrackingState.NotTracked || hand.Position.Y < hip.Position.Y + raise) continue;
                    DepthSpacePoint point = sensor.CoordinateMapper.MapCameraPointToDepthSpace(hand.Position);
                    if (float.IsNaN(point.X) || float.IsInfinity(point.X) ||
                        float.IsNaN(point.Y) || float.IsInfinity(point.Y) ||
                        float.IsNaN(bodyPoint.X) || float.IsInfinity(bodyPoint.X)) continue;

                    bool right = jointType == JointType.HandRight;
                    HandState state = right ? body.HandRightState : body.HandLeftState;
                    if (!first) json.Append(',');
                    first = false;
                    json.Append("{\"x\":").Append(Num(point.X / W, 4))
                        .Append(",\"y\":").Append(Num(point.Y / H, 4))
                        .Append(",\"z\":").Append(Num(hand.Position.Z * 1000, 0))
                        .Append(",\"bx\":").Append(Num(bodyPoint.X / W, 4))
                        .Append(",\"n\":0,\"side\":\"").Append(right ? "Right" : "Left")
                        .Append("\",\"closed\":").Append(state == HandState.Closed ? "true" : "false")
                        .Append(",\"id\":").Append(body.TrackingId * 2UL + (right ? 1UL : 0UL)).Append('}');
                }
            }
            json.Append("]}");
            Server.Broadcast("hands", json.ToString());
        }

        void OnDepthFrame(object sender, DepthFrameArrivedEventArgs e)
        {
            lastActivity = DateTime.Now;
            int minDepth, maxDepth;
            using (var frame = e.FrameReference.AcquireFrame())
            {
                if (frame == null) return;
                frame.CopyFrameDataToArray(depth);
                minDepth = frame.DepthMinReliableDistance;
                maxDepth = frame.DepthMaxReliableDistance;
            }
            if (Server.Wants("depth") && (DateTime.Now - lastPicture).TotalMilliseconds > 90)
            {
                lastPicture = DateTime.Now;
                Server.Broadcast("depth", DepthJpeg(minDepth, maxDepth));
            }
        }

        static string Num(double value, int decimals)
        {
            return Math.Round(value, decimals).ToString(CultureInfo.InvariantCulture);
        }

        byte[] DepthJpeg(int minDepth, int maxDepth)
        {
            using (var bmp = new Bitmap(W, H, PixelFormat.Format24bppRgb))
            {
                var data = bmp.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
                var row = new byte[data.Stride];
                for (int y = 0; y < H; y++)
                {
                    for (int x = 0; x < W; x++)
                    {
                        int mm = depth[y * W + x];
                        int value = mm >= minDepth && mm <= maxDepth
                            ? (int)Math.Max(0, Math.Min(255, (maxDepth - mm) * 255 / (maxDepth - minDepth))) : 0;
                        row[x * 3] = row[x * 3 + 1] = row[x * 3 + 2] = (byte)value;
                    }
                    System.Runtime.InteropServices.Marshal.Copy(row, 0, data.Scan0 + y * data.Stride, data.Stride);
                }
                bmp.UnlockBits(data);
                using (var ms = new MemoryStream())
                {
                    bmp.Save(ms, ImageFormat.Jpeg);
                    return ms.ToArray();
                }
            }
        }
    }
#else
    class Tracker
#if !NOGRIP
        : IInteractionClient
#endif
    {
        const int W = 640, H = 480;
        KinectSensor sensor;
        Skeleton[] skeletons;
        DepthImagePixel[] depth;
        readonly double raise;
        readonly Dictionary<string, bool> gripped = new Dictionary<string, bool>();
        readonly object gripLock = new object();
        DateTime lastPicture = DateTime.MinValue;
        bool waitingSaid;
#if !NOGRIP
        InteractionStream interaction;
        UserInfo[] users;
#endif

        public Tracker(double raise) { this.raise = raise; }
        public bool Running { get { return sensor != null && sensor.Status == KinectStatus.Connected && sensor.IsRunning; } }

        public void TryStart()
        {
            try
            {
                if (sensor != null) { try { sensor.Stop(); } catch { } sensor = null; }
                foreach (var s in KinectSensor.KinectSensors)
                    if (s.Status == KinectStatus.Connected) { sensor = s; break; }
                if (sensor == null)
                {
                    if (!waitingSaid) Console.WriteLine("No Kinect yet (USB and power adapter?). Waiting...");
                    waitingSaid = true;
                    return;
                }
                waitingSaid = false;
                sensor.SkeletonStream.Enable(new TransformSmoothParameters
                {
                    Smoothing = 0.5f, Correction = 0.5f, Prediction = 0.4f, JitterRadius = 0.05f, MaxDeviationRadius = 0.04f
                });
                sensor.DepthStream.Enable(DepthImageFormat.Resolution640x480Fps30);
                skeletons = new Skeleton[sensor.SkeletonStream.FrameSkeletonArrayLength];
                depth = new DepthImagePixel[sensor.DepthStream.FramePixelDataLength];
#if !NOGRIP
                users = new UserInfo[InteractionFrame.UserInfoArrayLength];
                interaction = new InteractionStream(sensor, this);
                interaction.InteractionFrameReady += OnInteraction;
#endif
                sensor.DepthFrameReady += OnDepth;
                sensor.SkeletonFrameReady += OnSkeleton;
                sensor.Start();
                Console.WriteLine("Kinect started.");
            }
            catch (Exception e)
            {
                Console.WriteLine("Kinect could not start: " + e.Message);
                sensor = null;
            }
        }

#if !NOGRIP
        // every place is a grip target: we only want to know whether a hand is open or closed
        public InteractionInfo GetInteractionInfoAtLocation(int skeletonTrackingId, InteractionHandType handType, double x, double y)
        {
            var info = new InteractionInfo();
            info.IsGripTarget = true;
            info.IsPressTarget = false;
            return info;
        }

        void OnInteraction(object sender, InteractionFrameReadyEventArgs e)
        {
            using (var f = e.OpenInteractionFrame())
            {
                if (f == null) return;
                f.CopyInteractionDataTo(users);
            }
            lock (gripLock)
            {
                foreach (var u in users)
                {
                    if (u == null || u.SkeletonTrackingId == 0) continue;
                    foreach (var hp in u.HandPointers)
                    {
                        string key = u.SkeletonTrackingId + (hp.HandType == InteractionHandType.Right ? "R" : "L");
                        if (hp.HandEventType == InteractionHandEventType.Grip) gripped[key] = true;
                        else if (hp.HandEventType == InteractionHandEventType.GripRelease) gripped[key] = false;
                        if (!hp.IsTracked) gripped.Remove(key);
                    }
                }
            }
        }
#endif

        void OnDepth(object sender, DepthImageFrameReadyEventArgs e)
        {
            using (var f = e.OpenDepthImageFrame())
            {
                if (f == null) return;
                f.CopyDepthImagePixelDataTo(depth);
#if !NOGRIP
                try { interaction.ProcessDepth(depth, f.Timestamp); } catch (InvalidOperationException) { }
#endif
                if (Server.Wants("depth") && (DateTime.Now - lastPicture).TotalMilliseconds > 90)
                {
                    lastPicture = DateTime.Now;
                    Server.Broadcast("depth", DepthJpeg());
                }
            }
        }

        void OnSkeleton(object sender, SkeletonFrameReadyEventArgs e)
        {
            long ts;
            using (var f = e.OpenSkeletonFrame())
            {
                if (f == null) return;
                f.CopySkeletonDataTo(skeletons);
                ts = f.Timestamp;
            }
#if !NOGRIP
            try { interaction.ProcessSkeleton(skeletons, sensor.AccelerometerGetCurrentReading(), ts); } catch (InvalidOperationException) { }
#endif
            if (!Server.Wants("hands")) return;
            var json = new StringBuilder();
            json.Append("{\"w\":640,\"h\":480,\"bg\":true,\"learning\":null,\"skeleton\":true,\"hands\":[");
            bool first = true;
            foreach (var sk in skeletons)
            {
                if (sk == null || sk.TrackingState != SkeletonTrackingState.Tracked) continue;
                Joint hip = sk.Joints[JointType.HipCenter], spine = sk.Joints[JointType.ShoulderCenter];
                DepthImagePoint body = Map(spine.Position);
                foreach (var jt in new[] { JointType.HandRight, JointType.HandLeft })
                {
                    Joint hand = sk.Joints[jt];
                    if (hand.TrackingState == JointTrackingState.NotTracked) continue;
                    if (hand.Position.Y < hip.Position.Y + raise) continue;        // arm hanging down
                    DepthImagePoint p = Map(hand.Position);
                    bool right = jt == JointType.HandRight;
                    bool closed;
                    lock (gripLock) { gripped.TryGetValue(sk.TrackingId + (right ? "R" : "L"), out closed); }
                    if (!first) json.Append(',');
                    first = false;
                    json.Append("{\"x\":").Append(Num(p.X / (double)W, 4))
                        .Append(",\"y\":").Append(Num(p.Y / (double)H, 4))
                        .Append(",\"z\":").Append(Num(hand.Position.Z * 1000, 0))
                        .Append(",\"bx\":").Append(Num(body.X / (double)W, 4))
                        .Append(",\"n\":0,\"side\":\"").Append(right ? "Right" : "Left")
                        .Append("\",\"closed\":").Append(closed ? "true" : "false")
                        .Append(",\"id\":").Append(sk.TrackingId * 2 + (right ? 1 : 0)).Append('}');
                }
            }
            json.Append("]}");
            Server.Broadcast("hands", json.ToString());
        }

        DepthImagePoint Map(SkeletonPoint p)
        {
            return sensor.CoordinateMapper.MapSkeletonPointToDepthPoint(p, DepthImageFormat.Resolution640x480Fps30);
        }

        static string Num(double v, int decimals)
        {
            return Math.Round(v, decimals).ToString(CultureInfo.InvariantCulture);
        }

        // the depth picture for the setup screen: near is bright; people (player index) a little brighter
        byte[] DepthJpeg()
        {
            using (var bmp = new Bitmap(W, H, PixelFormat.Format24bppRgb))
            {
                var data = bmp.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
                var row = new byte[data.Stride];
                for (int y = 0; y < H; y++)
                {
                    for (int x = 0; x < W; x++)
                    {
                        DepthImagePixel px = depth[y * W + x];
                        int v = px.IsKnownDepth ? (int)Math.Max(0, Math.Min(255, (4000 - px.Depth) * 255 / 3500)) : 0;
                        if (px.PlayerIndex > 0) v = Math.Min(255, v + 60);
                        row[x * 3] = row[x * 3 + 1] = row[x * 3 + 2] = (byte)v;
                    }
                    System.Runtime.InteropServices.Marshal.Copy(row, 0, data.Scan0 + y * data.Stride, data.Stride);
                }
                bmp.UnlockBits(data);
                using (var ms = new MemoryStream())
                {
                    bmp.Save(ms, ImageFormat.Jpeg);
                    return ms.ToArray();
                }
            }
        }
    }
#endif

    // ───────────── web server and WebSockets, on one port ─────────────
    static class Server
    {
        class Client { public TcpClient Tcp; public Stream Stream; public string Path; public readonly object Lock = new object(); }
        static readonly List<Client> clients = new List<Client>();
        static string root;
        static readonly Dictionary<string, string> Types = new Dictionary<string, string>
        {
            { ".htm", "text/html; charset=utf-8" }, { ".html", "text/html; charset=utf-8" },
            { ".js", "text/javascript; charset=utf-8" }, { ".mjs", "text/javascript; charset=utf-8" },
            { ".css", "text/css; charset=utf-8" }, { ".json", "application/json" }, { ".svg", "image/svg+xml" },
            { ".png", "image/png" }, { ".jpg", "image/jpeg" }, { ".jpeg", "image/jpeg" }, { ".webp", "image/webp" },
            { ".woff2", "font/woff2" }, { ".woff", "font/woff" }, { ".glb", "model/gltf-binary" },
            { ".wasm", "application/wasm" }, { ".txt", "text/plain; charset=utf-8" }, { ".tflite", "application/octet-stream" },
            { ".binarypb", "application/octet-stream" }, { ".data", "application/octet-stream" }
        };

        public static void Start(int port, string webRoot)
        {
            root = webRoot;
            var listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();
            var t = new Thread(() =>
            {
                while (true)
                {
                    TcpClient c = listener.AcceptTcpClient();
                    var th = new Thread(() => Handle(c));
                    th.IsBackground = true;
                    th.Start();
                }
            });
            t.IsBackground = true;
            t.Start();
        }

        public static bool Wants(string path)
        {
            lock (clients) { foreach (var c in clients) if (c.Path == path) return true; }
            return false;
        }

        public static void Broadcast(string path, string text) { Send(path, 0x1, Encoding.UTF8.GetBytes(text)); }
        public static void Broadcast(string path, byte[] data) { Send(path, 0x2, data); }

        static void Send(string path, int opcode, byte[] payload)
        {
            List<Client> list;
            lock (clients) { list = clients.FindAll(c => c.Path == path); }
            byte[] head = FrameHead(opcode, payload.Length);
            foreach (var c in list)
            {
                try { lock (c.Lock) { c.Stream.Write(head, 0, head.Length); c.Stream.Write(payload, 0, payload.Length); } }
                catch { Drop(c); }
            }
        }

        static byte[] FrameHead(int opcode, int len)
        {
            if (len < 126) return new byte[] { (byte)(0x80 | opcode), (byte)len };
            if (len < 65536) return new byte[] { (byte)(0x80 | opcode), 126, (byte)(len >> 8), (byte)len };
            var h = new byte[10];
            h[0] = (byte)(0x80 | opcode); h[1] = 127;
            for (int i = 0; i < 8; i++) h[9 - i] = (byte)((long)len >> (8 * i));
            return h;
        }

        static void Drop(Client c)
        {
            lock (clients) { clients.Remove(c); }
            try { c.Tcp.Close(); } catch { }
        }

        static void Handle(TcpClient tcp)
        {
            try
            {
                tcp.NoDelay = true;
                Stream s = tcp.GetStream();
                string request = ReadHead(s);
                if (request == null) { tcp.Close(); return; }
                string[] lines = request.Split(new[] { "\r\n" }, StringSplitOptions.None);
                string[] first = lines[0].Split(' ');
                string target = first.Length > 1 ? first[1] : "/";
                var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                for (int i = 1; i < lines.Length; i++)
                {
                    int k = lines[i].IndexOf(':');
                    if (k > 0) headers[lines[i].Substring(0, k).Trim()] = lines[i].Substring(k + 1).Trim();
                }
                string upgrade;
                if (headers.TryGetValue("Upgrade", out upgrade) && upgrade.ToLowerInvariant() == "websocket")
                    WebSocket(tcp, s, target, headers);
                else
                    ServeFile(tcp, s, target);
            }
            catch { try { tcp.Close(); } catch { } }
        }

        static string ReadHead(Stream s)
        {
            var buf = new List<byte>();
            int b;
            while ((b = s.ReadByte()) >= 0)
            {
                buf.Add((byte)b);
                int n = buf.Count;
                if (n >= 4 && buf[n - 4] == 13 && buf[n - 3] == 10 && buf[n - 2] == 13 && buf[n - 1] == 10)
                    return Encoding.ASCII.GetString(buf.ToArray());
                if (n > 16384) return null;
            }
            return null;
        }

        static void WebSocket(TcpClient tcp, Stream s, string target, Dictionary<string, string> headers)
        {
            string key = headers["Sec-WebSocket-Key"];
            string accept;
            using (var sha = SHA1.Create())
                accept = Convert.ToBase64String(sha.ComputeHash(Encoding.ASCII.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
            byte[] resp = Encoding.ASCII.GetBytes("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
            s.Write(resp, 0, resp.Length);
            string path = target.Trim('/');
            if (path != "hands" && path != "depth") { tcp.Close(); return; }
            var c = new Client { Tcp = tcp, Stream = s, Path = path };
            lock (clients) { clients.Add(c); }
            Console.WriteLine("+ " + path + " client");
            // read what the page sends (settings, "learn": nothing to do with skeletons), answer pings, notice the close
            try
            {
                while (true)
                {
                    int b0 = s.ReadByte(), b1 = s.ReadByte();
                    if (b0 < 0 || b1 < 0) break;
                    int op = b0 & 0x0F;
                    long len = b1 & 0x7F;
                    if (len == 126) len = (s.ReadByte() << 8) | s.ReadByte();
                    else if (len == 127) { len = 0; for (int i = 0; i < 8; i++) len = (len << 8) | (uint)s.ReadByte(); }
                    var mask = new byte[4];
                    if ((b1 & 0x80) != 0) ReadAll(s, mask, 4);
                    var data = new byte[len];
                    ReadAll(s, data, (int)len);
                    for (int i = 0; i < len; i++) data[i] ^= mask[i % 4];
                    if (op == 0x8) break;
                    if (op == 0x9) { var h = FrameHead(0xA, data.Length); lock (c.Lock) { s.Write(h, 0, h.Length); s.Write(data, 0, data.Length); } }
                }
            }
            catch { }
            Drop(c);
            Console.WriteLine("- " + path + " client");
        }

        static void ReadAll(Stream s, byte[] buf, int n)
        {
            int got = 0;
            while (got < n)
            {
                int r = s.Read(buf, got, n - got);
                if (r <= 0) throw new IOException("closed");
                got += r;
            }
        }

        static void ServeFile(TcpClient tcp, Stream s, string target)
        {
            string rel = Uri.UnescapeDataString(target.Split('?')[0]).TrimStart('/');
            if (rel == "") rel = "index.htm";
            string full = Path.GetFullPath(Path.Combine(root, rel.Replace('/', Path.DirectorySeparatorChar)));
            byte[] body;
            string status = "200 OK", type;
            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
            {
                status = "404 Not Found"; type = "text/plain"; body = Encoding.ASCII.GetBytes("not found");
            }
            else
            {
                body = File.ReadAllBytes(full);
                if (!Types.TryGetValue(Path.GetExtension(full).ToLowerInvariant(), out type)) type = "application/octet-stream";
            }
            byte[] head = Encoding.ASCII.GetBytes("HTTP/1.1 " + status + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.Length +
                                                  "\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n");
            s.Write(head, 0, head.Length);
            s.Write(body, 0, body.Length);
            s.Flush();
            tcp.Close();
        }
    }
}
