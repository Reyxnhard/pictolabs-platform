using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Printing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Windows.Forms;
using Microsoft.CodeAnalysis;

[assembly: CompilationRelaxations(8)]
[assembly: RuntimeCompatibility(WrapNonExceptionThrows = true)]
[assembly: Debuggable(DebuggableAttribute.DebuggingModes.IgnoreSymbolStoreSequencePoints)]
[assembly: TargetFramework(".NETCoreApp,Version=v6.0", FrameworkDisplayName = "")]
[assembly: AssemblyCompany("print")]
[assembly: AssemblyConfiguration("Release")]
[assembly: AssemblyFileVersion("1.0.0.0")]
[assembly: AssemblyInformationalVersion("1.0.0")]
[assembly: AssemblyProduct("print")]
[assembly: AssemblyTitle("print")]
[assembly: TargetPlatform("Windows7.0")]
[assembly: SupportedOSPlatform("Windows7.0")]
[assembly: AssemblyVersion("1.0.0.0")]
namespace Microsoft.CodeAnalysis
{
	[CompilerGenerated]
	[Embedded]
	internal sealed class EmbeddedAttribute : Attribute
	{
	}
}
namespace System.Runtime.CompilerServices
{
	[CompilerGenerated]
	[Embedded]
	[AttributeUsage(AttributeTargets.Class | AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Event | AttributeTargets.Parameter | AttributeTargets.ReturnValue | AttributeTargets.GenericParameter, AllowMultiple = false, Inherited = false)]
	internal sealed class NullableAttribute : Attribute
	{
		public readonly byte[] NullableFlags;

		public NullableAttribute(byte P_0)
		{
			NullableFlags = new byte[1] { P_0 };
		}

		public NullableAttribute(byte[] P_0)
		{
			NullableFlags = P_0;
		}
	}
	[CompilerGenerated]
	[Embedded]
	[AttributeUsage(AttributeTargets.Class | AttributeTargets.Struct | AttributeTargets.Method | AttributeTargets.Interface | AttributeTargets.Delegate, AllowMultiple = false, Inherited = false)]
	internal sealed class NullableContextAttribute : Attribute
	{
		public readonly byte Flag;

		public NullableContextAttribute(byte P_0)
		{
			Flag = P_0;
		}
	}
}
internal static class Program
{
	[STAThread]
	private static void Main(string[] args)
	{
		if (args.Length == 0)
		{
			Console.WriteLine("Usage: PrintApp.exe <image path> [copies] [scale%] [offsetX] [offsetY] [printer name] [second image path]");
			Console.WriteLine("  If the printer name contains 'custom paper' (case-insensitive), the printer's user-defined");
			Console.WriteLine("  paper size is auto-detected and forced. Every other printer keeps its own driver default.");
			return;
		}
		string text = CleanFilePath(args[0]);
		int result = 1;
		if (args.Length > 1 && !int.TryParse(args[1], out result))
		{
			result = 1;
		}
		float result2 = 100f;
		if (args.Length > 2 && !float.TryParse(args[2], out result2))
		{
			result2 = 100f;
		}
		float result3 = 0f;
		if (args.Length > 3 && !float.TryParse(args[3], out result3))
		{
			result3 = 0f;
		}
		float result4 = 0f;
		if (args.Length > 4 && !float.TryParse(args[4], out result4))
		{
			result4 = 0f;
		}
		string text2 = "";
		string text3 = "";
		if (args.Length > 5)
		{
			string text4 = CleanFilePath(args[5]);
			if (File.Exists(text4))
			{
				text3 = text4;
			}
			else
			{
				text2 = args[5];
			}
		}
		if (args.Length > 6)
		{
			text3 = CleanFilePath(args[6]);
		}
		bool flag = !string.IsNullOrEmpty(text2) && text2.IndexOf("CD", StringComparison.OrdinalIgnoreCase) >= 0;
		bool flag2 = !string.IsNullOrEmpty(text2) && text2.IndexOf("receipt", StringComparison.OrdinalIgnoreCase) >= 0;
		bool flag3 = !string.IsNullOrEmpty(text2) && text2.IndexOf("custom paper", StringComparison.OrdinalIgnoreCase) >= 0;
		Console.WriteLine($"--- Args received ({args.Length}) ---");
		for (int i = 0; i < args.Length; i++)
		{
			Console.WriteLine($"  [{i}] = '{args[i]}'");
		}
		Console.WriteLine("--- Parsed slots ---");
		Console.WriteLine("  image     = '" + text + "'");
		Console.WriteLine($"  copies    = {result}");
		Console.WriteLine($"  scale%    = {result2}");
		Console.WriteLine($"  offsetX   = {result3}");
		Console.WriteLine($"  offsetY   = {result4}");
		Console.WriteLine("  printer   = '" + text2 + "'");
		Console.WriteLine("  2ndImage  = '" + text3 + "'");
		Console.WriteLine($"  cdMode    = {flag} (auto-detect from printer name contains 'CD')");
		Console.WriteLine($"  receipt   = {flag2} (auto-detect from printer name contains 'receipt')");
		Console.WriteLine($"  customPpr = {flag3} (auto-detect from printer name contains 'custom paper')");
		Console.WriteLine("---");
		Console.WriteLine("Image: " + text);
		Console.WriteLine("Second Image: " + (string.IsNullOrEmpty(text3) ? "(none)" : text3));
		Console.WriteLine($"Printer: '{(string.IsNullOrEmpty(text2) ? "(default)" : text2)}', Scale: {result2}%, Offset: ({result3},{result4})");
		Console.WriteLine($"Copies: {result}, CD Mode: {flag}");
		new PrintingExample(text, text3, result, text2, result2, result3, result4, flag, flag2, flag3).Print();
	}

	private static string CleanFilePath(string path)
	{
		if (path.StartsWith("file:///"))
		{
			path = path.Substring(8);
		}
		else if (path.StartsWith("file://"))
		{
			path = path.Substring(7);
		}
		return Uri.UnescapeDataString(path);
	}
}
public class PrintingExample
{
	private struct BITMAPINFOHEADER
	{
		public uint biSize;

		public int biWidth;

		public int biHeight;

		public ushort biPlanes;

		public ushort biBitCount;

		public uint biCompression;

		public uint biSizeImage;

		public int biXPelsPerMeter;

		public int biYPelsPerMeter;

		public uint biClrUsed;

		public uint biClrImportant;
	}

	private PrintDocument printDocument = new PrintDocument();

	private List<string> imagePaths = new List<string>();

	private int currentPage;

	private int copies;

	private int currentCopy;

	private string printerName;

	private float scalePercent;

	private float offsetX;

	private float offsetY;

	private bool cdMode;

	private bool receiptMode;

	private bool customPaperMode;

	private const float DISC_SIZE_HUNDREDTHS_INCH = 472f;

	private const float CD_DEFAULT_OFFSET_X = 48f;

	private const float CD_DEFAULT_OFFSET_Y = 19f;

	private const int BI_RGB = 0;

	private const uint DIB_RGB_COLORS = 0u;

	private const uint SRCCOPY = 13369376u;

	private const int COLORONCOLOR = 3;

	public PrintingExample(string imagePath, string secondImagePath, int copies, string printerName, float scalePercent, float offsetX, float offsetY, bool cdMode, bool receiptMode, bool customPaperMode)
	{
		imagePaths.Add(imagePath);
		if (!string.IsNullOrEmpty(secondImagePath) && File.Exists(secondImagePath))
		{
			imagePaths.Add(secondImagePath);
		}
		this.copies = copies;
		this.printerName = printerName;
		this.scalePercent = scalePercent;
		this.offsetX = offsetX;
		this.offsetY = offsetY;
		this.cdMode = cdMode;
		this.receiptMode = receiptMode;
		this.customPaperMode = customPaperMode;
		printDocument.PrintPage += PrintPage;
	}

	public void Print()
	{
		try
		{
			if (imagePaths.Count == 0 || !File.Exists(imagePaths[0]))
			{
				throw new ArgumentException("Invalid image path.");
			}
			if (!string.IsNullOrWhiteSpace(printerName))
			{
				if (!PrinterSettings.InstalledPrinters.Cast<string>().Any((string p) => p == printerName))
				{
					throw new ArgumentException("Printer '" + printerName + "' not found.");
				}
				printDocument.PrinterSettings.PrinterName = printerName;
			}
			if (customPaperMode)
			{
				try
				{
					if (DriverDefaults.TryGetPaperMm(printDocument.PrinterSettings.PrinterName, out var widthMm, out var heightMm))
					{
						int num = (int)Math.Round((double)widthMm / 25.4 * 100.0);
						int num2 = (int)Math.Round((double)heightMm / 25.4 * 100.0);
						PaperSize paperSize = new PaperSize($"Custom_{widthMm:0.#}x{heightMm:0.#}mm", num, num2);
						paperSize.RawKind = 256;
						printDocument.DefaultPageSettings.PaperSize = paperSize;
						printDocument.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);
						printDocument.OriginAtMargins = false;
						Console.WriteLine($"CUSTOM PAPER: forced {widthMm}x{heightMm}mm (driver user-defined via DEVMODE) -> {num}x{num2} (1/100in)");
					}
					else
					{
						Console.WriteLine("CUSTOM PAPER: driver has no user-defined size; using .NET default.");
					}
				}
				catch (Exception ex)
				{
					Console.WriteLine("CUSTOM PAPER: failed (" + ex.Message + "); falling back to driver/.NET default paper.");
				}
			}
			else
			{
				Console.WriteLine("Paper: driver/.NET default (printer name has no 'custom paper' marker).");
			}
			for (int num3 = 0; num3 < copies; num3++)
			{
				currentCopy = num3;
				currentPage = 0;
				printDocument.Print();
			}
		}
		catch (Exception ex2)
		{
			MessageBox.Show("An error occurred while printing: " + ex2.Message);
		}
	}

	private void PrintPage(object sender, PrintPageEventArgs e)
	{
		string text = imagePaths[currentPage];
		using (FileStream stream = new FileStream(text, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
		{
			using Image image = Image.FromStream(stream, useEmbeddedColorManagement: true, validateImageData: true);
			float num = image.Width;
			float num2 = image.Height;
			RectangleF rectangleF = e.PageBounds;
			float num4;
			float num5;
			float num8;
			float num9;
			if (cdMode)
			{
				float num3 = 472f * (scalePercent / 100f);
				num4 = num3;
				num5 = num3;
				float num6 = 48f + offsetX;
				float num7 = 19f + offsetY;
				num8 = rectangleF.Left + num6;
				num9 = rectangleF.Top + num7;
				Console.WriteLine($"CD Mode: hardcoded offset ({48f}, {19f}) + user ({offsetX}, {offsetY}) = ({num6}, {num7})");
				Console.WriteLine($"  Size: {num3}x{num3} (120x120mm * {scalePercent}%)");
			}
			else
			{
				float num10 = Math.Min(rectangleF.Width / num, rectangleF.Height / num2) * (scalePercent / 100f);
				num4 = num * num10;
				num5 = num2 * num10;
				num8 = rectangleF.Left + (rectangleF.Width - num4) / 2f + offsetX;
				num9 = rectangleF.Top + (rectangleF.Height - num5) / 2f + offsetY;
			}
			Console.WriteLine($"Copy {currentCopy + 1}/{copies}, Page {currentPage + 1}/{imagePaths.Count}");
			Console.WriteLine("Image: " + text);
			Console.WriteLine($"Pixels: {num}x{num2}");
			Console.WriteLine($"Page Bounds: {rectangleF.Left},{rectangleF.Top} {rectangleF.Width}x{rectangleF.Height}");
			Console.WriteLine($"Print Size: {num4:F1}x{num5:F1} (1/100 inch)");
			Console.WriteLine($"Position: x={num8:F1}, y={num9:F1}");
			Console.WriteLine("Mode: " + (receiptMode ? "RECEIPT (StretchDIBits, driver handles halftone)" : "NORMAL (GDI+ DrawImage)"));
			if (receiptMode)
			{
				float dpiX = e.Graphics.DpiX;
				float dpiY = e.Graphics.DpiY;
				int num11 = Math.Max(1, (int)Math.Round(num4 / 100f * dpiX));
				int num12 = Math.Max(1, (int)Math.Round(num5 / 100f * dpiY));
				int num13 = (int)Math.Round(num8 / 100f * dpiX);
				int num14 = (int)Math.Round(num9 / 100f * dpiY);
				Console.WriteLine($"Printer DPI: {dpiX}x{dpiY}");
				Console.WriteLine($"Device px: dest=({num13},{num14}) size={num11}x{num12}");
				using Bitmap bitmap = new Bitmap(num11, num12, PixelFormat.Format24bppRgb);
				using (Graphics graphics = Graphics.FromImage(bitmap))
				{
					graphics.Clear(Color.White);
					graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
					graphics.SmoothingMode = SmoothingMode.HighQuality;
					graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
					graphics.CompositingQuality = CompositingQuality.HighQuality;
					graphics.DrawImage(image, new RectangleF(0f, 0f, num11, num12), new RectangleF(0f, 0f, num, num2), GraphicsUnit.Pixel);
				}
				BlitToPrinter(e.Graphics, bitmap, num13, num14);
			}
			else
			{
				RectangleF destRect = new RectangleF(num8, num9, num4, num5);
				RectangleF srcRect = new RectangleF(0f, 0f, num, num2);
				e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
				e.Graphics.SmoothingMode = SmoothingMode.HighQuality;
				e.Graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
				e.Graphics.CompositingQuality = CompositingQuality.HighQuality;
				e.Graphics.DrawImage(image, destRect, srcRect, GraphicsUnit.Pixel);
			}
		}
		currentPage++;
		e.HasMorePages = currentPage < imagePaths.Count;
	}

	private static void BlitToPrinter(Graphics target, Bitmap bmp, int xDest, int yDest)
	{
		bmp.RotateFlip(RotateFlipType.RotateNoneFlipX);
		int width = bmp.Width;
		int height = bmp.Height;
		BitmapData bitmapData = bmp.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
		int stride = bitmapData.Stride;
		byte[] array;
		try
		{
			array = new byte[stride * height];
			Marshal.Copy(bitmapData.Scan0, array, 0, array.Length);
		}
		finally
		{
			bmp.UnlockBits(bitmapData);
		}
		BITMAPINFOHEADER bmi = new BITMAPINFOHEADER
		{
			biSize = (uint)Marshal.SizeOf<BITMAPINFOHEADER>(),
			biWidth = width,
			biHeight = -height,
			biPlanes = 1,
			biBitCount = 24,
			biCompression = 0u,
			biSizeImage = (uint)(stride * height)
		};
		IntPtr hdc = target.GetHdc();
		try
		{
			SetStretchBltMode(hdc, 3);
			if (StretchDIBits(hdc, xDest, yDest, width, height, 0, 0, width, height, array, ref bmi, 0u, 13369376u) == 0)
			{
				Console.WriteLine("StretchDIBits returned 0 (nothing scanned).");
			}
		}
		finally
		{
			target.ReleaseHdc(hdc);
		}
	}

	[DllImport("gdi32.dll")]
	private static extern int SetStretchBltMode(IntPtr hdc, int mode);

	[DllImport("gdi32.dll")]
	private static extern int StretchDIBits(IntPtr hdc, int xDest, int yDest, int destWidth, int destHeight, int xSrc, int ySrc, int srcWidth, int srcHeight, byte[] bits, ref BITMAPINFOHEADER bmi, uint usage, uint rop);
}
internal static class DriverDefaults
{
	[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
	private struct DEVMODE
	{
		[MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
		public string dmDeviceName;

		public ushort dmSpecVersion;

		public ushort dmDriverVersion;

		public ushort dmSize;

		public ushort dmDriverExtra;

		public uint dmFields;

		public short dmOrientation;

		public short dmPaperSize;

		public short dmPaperLength;

		public short dmPaperWidth;

		public short dmScale;

		public short dmCopies;

		public short dmDefaultSource;

		public short dmPrintQuality;

		public short dmColor;

		public short dmDuplex;

		public short dmYResolution;

		public short dmTTOption;

		public short dmCollate;

		[MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
		public string dmFormName;

		public ushort dmLogPixels;

		public uint dmBitsPerPel;

		public uint dmPelsWidth;

		public uint dmPelsHeight;

		public uint dmDisplayFlags;

		public uint dmDisplayFrequency;

		public uint dmICMMethod;

		public uint dmICMIntent;

		public uint dmMediaType;

		public uint dmDitherType;

		public uint dmReserved1;

		public uint dmReserved2;

		public uint dmPanningWidth;

		public uint dmPanningHeight;
	}

	private const int DM_OUT_BUFFER = 2;

	private const uint DM_PAPERLENGTH = 4u;

	private const uint DM_PAPERWIDTH = 8u;

	public static bool TryGetPaperMm(string printerName, out float widthMm, out float heightMm)
	{
		widthMm = 0f;
		heightMm = 0f;
		if (string.IsNullOrWhiteSpace(printerName))
		{
			return false;
		}
		try
		{
			if (!OpenPrinter(printerName, out var phPrinter, IntPtr.Zero))
			{
				return false;
			}
			try
			{
				int num = DocumentProperties(IntPtr.Zero, phPrinter, printerName, IntPtr.Zero, IntPtr.Zero, 0);
				if (num <= 0)
				{
					return false;
				}
				IntPtr intPtr = Marshal.AllocHGlobal(num);
				try
				{
					if (DocumentProperties(IntPtr.Zero, phPrinter, printerName, intPtr, IntPtr.Zero, 2) < 0)
					{
						return false;
					}
					DEVMODE dEVMODE = Marshal.PtrToStructure<DEVMODE>(intPtr);
					bool flag = (dEVMODE.dmFields & 8) != 0;
					bool flag2 = (dEVMODE.dmFields & 4) != 0;
					if ((flag & flag2) && dEVMODE.dmPaperWidth > 0 && dEVMODE.dmPaperLength > 0)
					{
						widthMm = (float)dEVMODE.dmPaperWidth / 10f;
						heightMm = (float)dEVMODE.dmPaperLength / 10f;
						return true;
					}
					return false;
				}
				finally
				{
					Marshal.FreeHGlobal(intPtr);
				}
			}
			finally
			{
				ClosePrinter(phPrinter);
			}
		}
		catch (Exception ex)
		{
			Console.WriteLine("DriverDefaults.TryGetPaperMm failed (" + ex.Message + "); falling back to default paper.");
			widthMm = 0f;
			heightMm = 0f;
			return false;
		}
	}

	[DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
	private static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

	[DllImport("winspool.drv", SetLastError = true)]
	private static extern bool ClosePrinter(IntPtr hPrinter);

	[DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
	private static extern int DocumentProperties(IntPtr hWnd, IntPtr hPrinter, string pDeviceName, IntPtr pDevModeOutput, IntPtr pDevModeInput, int fMode);
}
