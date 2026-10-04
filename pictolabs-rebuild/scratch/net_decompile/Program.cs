using System;
using System.IO;
using ICSharpCode.Decompiler;
using ICSharpCode.Decompiler.CSharp;

class Program
{
    static void Main()
    {
        string dllPath = Path.GetFullPath(@"..\..\scripts\extracted_24e00.dll");
        var decompiler = new CSharpDecompiler(dllPath, new DecompilerSettings());
        string code = decompiler.DecompileWholeModuleAsString();
        File.WriteAllText(@"..\..\scripts\decompiled_print.cs", code);
        Console.WriteLine("Successfully decompiled to scripts/decompiled_print.cs! Length: " + code.Length);
    }
}
