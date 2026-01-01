---
title: **Analyzing Frame Drops with Perfetto**
date: 2025-12-07 17:25:29
published: true
tags:
---

**Analyzing Frame Drops with Perfetto**

I'm deep in the weeds with Perfetto, trying to figure out how it can pinpoint CPU spikes that cause those nasty GLThread frame drops. I've got a grasp of the tool, but I need to identify the CPU-related spikes and correlate those to the frame drops to solve this janky problem. I'm focusing on analyzing the trace data and filtering it for the CPU usage during the frame rendering process. The goal is to clearly relate high CPU load to missed frames, and I'm currently working to make that relation obvious.


**Deciphering Thread States**

Now, I'm focusing on the specifics of those trace states in the GLThread. Seeing "Running," "Runnable," and "Runnable (Preempted)" is great, but now I'm trying to confidently connect them to CPU saturation and frame drops. Does a constant stream of "Runnable (Preempted)" mean a bottleneck? How does this interplay? I'm trying to decipher these states to understand when, and why, they're not progressing the frame. I need to be sure that the CPU is the thing getting in the way of smooth GLThread progress.


**Visualizing CPU Bottlenecks**

I've got a handle on how to use Perfetto to identify the CPU load and tie it to the GLThread frame drops I've been seeing. Now I'm mentally simulating a Perfetto session, laying out the steps: locate the GLThread, inspect those long slices, and then I can examine the thread states, specifically "Runnable" which seems to be the smoking gun for CPU contention. I'm working on framing the analysis steps, and have started to structure an explanation around the "state" metaphor.


**Refining Analysis Steps**

I'm now thinking about how to refine the debugging steps. I've broken it down into indicators - the "long Runnable blocks" as the main clue, and preemptions, which I now realize need deeper inspection to find the "bully" process hogging CPU time. I'm also adding CPU frequency to consider thermal throttling. I'm considering the structure and refining it to make it clear. I'm focusing on "Scheduling Delay" in the analysis.


**Interpreting Runnable Durations**

I'm now zeroing in on the *duration* of the "Runnable" state, recognizing that a fleeting moment isn't a problem, but a lengthy block points to CPU starvation. I'm focusing on the distinction between "Running" (code inefficiency) and "Runnable" (CPU contention), and how these correlate to the "Scheduling Delay" the user mentioned as a key indicator. I'm refining my mental model with the terminology and tone to focus on the key insights.


**Adding CPU Hog Insights**

I'm solidifying the analysis process and realizing I need to add a dedicated section on identifying the CPU hog. This feature, which is about finding out who "stole the CPU," will require investigating the "End State" of the relevant trace slice and using flow arrows. It all revolves around making sure that I can answer the key user questions thoroughly and make the steps clear. I'm focusing on ensuring it's easily understandable.
