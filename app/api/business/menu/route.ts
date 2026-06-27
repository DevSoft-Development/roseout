import { NextResponse } from "next/server";
export async function GET(){return NextResponse.json({pages:[]});}
export async function POST(){return NextResponse.json({message:"Menu draft saved."});}
export async function PATCH(){return NextResponse.json({message:"Menu draft updated."});}
